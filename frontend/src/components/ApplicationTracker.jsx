import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft', color: 'bg-surface-200 text-surface-600' },
  { value: 'applied', label: 'Applied', color: 'bg-brand-100 text-brand-700' },
  { value: 'interviewed', label: 'Interview', color: 'bg-amber-50 text-amber-500' },
  { value: 'offered', label: 'Offered', color: 'bg-emerald-50 text-emerald-500' },
  { value: 'rejected', label: 'Rejected', color: 'bg-rose-50 text-rose-500' },
  { value: 'withdrawn', label: 'Withdrawn', color: 'bg-surface-200 text-surface-500' }
];

// A follow-up to an application that ended is not a follow-up.
const CLOSED_STATUSES = ['rejected', 'withdrawn'];

// How long an application may sit unanswered before the tracker suggests chasing
// it. Only used when the user has not set a date of their own -- a stored date
// always wins, including a deliberately distant one.
const DEFAULT_FOLLOW_UP_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

// Whole days between midnight today and the given date. Comparing dates rather
// than instants matters here: a follow-up set for today is due today from the
// moment it is written, not 40 hours from now.
function daysUntil(date) {
  const target = new Date(date);
  if (Number.isNaN(target.getTime())) return null;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTarget = new Date(target);
  startOfTarget.setHours(0, 0, 0, 0);
  return Math.round((startOfTarget - startOfToday) / DAY_MS);
}

/**
 * When this application needs attention, and why.
 *
 * `null` means nothing to do. The three non-null reasons are kept apart because
 * they mean different things to a user: an overdue date is something they set and
 * missed, a date set for today is theirs, and the elapsed-time nudge is a guess
 * the product made.
 */
function dueState(followUpDate, appliedAt, status) {
  if (CLOSED_STATUSES.includes(status)) return null;

  if (followUpDate) {
    const days = daysUntil(followUpDate);
    if (days === null) return null;
    if (days < 0) return { kind: 'overdue', days: Math.abs(days), source: 'user' };
    if (days === 0) return { kind: 'today', days: 0, source: 'user' };
    return null;
  }

  // No date set: fall back to elapsed time, as before.
  if (status !== 'applied' || !appliedAt) return null;
  const elapsed = Math.floor((Date.now() - new Date(appliedAt).getTime()) / DAY_MS);
  if (elapsed > DEFAULT_FOLLOW_UP_DAYS) {
    return { kind: 'elapsed', days: elapsed, source: 'guess' };
  }
  return null;
}

const toDateInput = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  // Local calendar date, not toISOString() -- which shifts the day for anyone
  // west of UTC and would silently move a follow-up they set.
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export default function ApplicationTracker({
  documentId,
  currentStatus,
  currentCompany,
  currentAppliedAt,
  currentNextAction,
  currentFollowUpDate,
  onUpdate
}) {
  // Both namespaces are needed. With only the default (`common`), every
  // `tailor.*` label below fell through to its inline English default -- so the
  // whole editor rendered in English regardless of the chosen language. `tracker.*`
  // stays in `common`, which is listed first.
  const { t } = useTranslation(['common', 'tailor']);
  const [status, setStatus] = useState(currentStatus || 'draft');
  const [company, setCompany] = useState(currentCompany || '');
  const [nextAction, setNextAction] = useState(currentNextAction || '');
  const [followUpDate, setFollowUpDate] = useState(toDateInput(currentFollowUpDate));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  if (!documentId) return null;

  const save = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const res = await api.patch(`/document/${documentId}/status`, {
        applicationStatus: status,
        companyApplied: company,
        nextAction,
        // Empty means "no date", which the server records as null rather than
        // leaving a stale one behind.
        followUpDate: followUpDate || null
      });
      onUpdate?.(res.data);
      setEditing(false);
    } catch (err) {
      // Previously an empty catch, so a failed save looked like a successful one:
      // the editor closed and the change was silently lost.
      setSaveError(err.response?.data?.error || t('tracker.saveFailed', 'Could not save. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  const statusOption = STATUS_OPTIONS.find(s => s.value === status);
  const due = dueState(currentFollowUpDate, currentAppliedAt, status);

  const followUpOnWhatsApp = () => {
    const subject = company || t('tracker.opportunity', 'this opportunity');
    const date = currentAppliedAt ? new Date(currentAppliedAt).toLocaleDateString() : '';
    const msg = t('tracker.whatsappFollowUp', 'Hello! I applied for the position at {{company}} on {{date}} and wanted to follow up on the status of my application. Thank you!', {
      company: subject,
      date
    });
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
  };

  const dueText = () => {
    if (!due) return '';
    if (due.kind === 'overdue') {
      return t('tracker.overdueDays', {
        count: due.days,
        defaultValue: `Your follow-up is {{count}} day overdue.`
      });
    }
    if (due.kind === 'today') return t('tracker.dueToday', 'Follow up today.');
    return t('tracker.followUpHint', `It's been {{days}} days since you applied. A polite follow-up can boost your chances.`, { days: due.days });
  };

  const dueTone = due?.kind === 'overdue'
    ? 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-700/40'
    : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700/40';
  const dueTextTone = due?.kind === 'overdue'
    ? 'text-rose-700 dark:text-rose-300'
    : 'text-amber-700 dark:text-amber-300';

  if (!editing) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className={`badge ${statusOption?.color || ''}`}>{statusOption?.label || status}</span>
          {company && <span className="text-xs text-surface-400">at {company}</span>}
          <button onClick={() => setEditing(true)} className="btn-ghost text-xs">
            {t('tailor.update', 'Update')}
          </button>
        </div>

        {(currentNextAction || currentFollowUpDate) && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {currentNextAction && (
              <span className="text-surface-700 dark:text-surface-200">
                <span className="text-surface-400">{t('tracker.nextActionLabel', 'Next:')}</span>{' '}
                {currentNextAction}
              </span>
            )}
            {currentFollowUpDate && (
              <span className="text-surface-400">
                {t('tracker.followUpOn', 'Follow up {{date}}', {
                  date: new Date(currentFollowUpDate).toLocaleDateString()
                })}
              </span>
            )}
          </div>
        )}

        {due && (
          <div className={`flex flex-wrap items-center gap-2 border rounded-lg px-3 py-2 animate-scale-in ${dueTone}`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`${due.kind === 'overdue' ? 'text-rose-500' : 'text-amber-500'} flex-shrink-0`}>
              <circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>
            </svg>
            <p className={`text-xs ${dueTextTone}`}>{dueText()}</p>
            <button onClick={followUpOnWhatsApp} className="btn-ghost text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              {t('tracker.followUpWhatsApp', 'Send follow-up')}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-surface-50 rounded-xl p-3.5 space-y-3 animate-scale-in">
      <div>
        <label htmlFor="tracker-company" className="text-xs font-medium text-surface-500 mb-1 block">{t('tailor.company', 'Company')}</label>
        <input
          id="tracker-company"
          type="text"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder={t('tailor.companyPlaceholder', 'e.g. MTN Cameroon')}
          className="input-field text-sm py-2"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-surface-500 mb-1.5 block">{t('tailor.status', 'Status')}</label>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setStatus(opt.value)}
              className={`badge cursor-pointer transition-all ${
                status === opt.value ? `${opt.color} ring-2 ring-offset-1 ring-brand-300` : 'bg-surface-100 text-surface-400 hover:bg-surface-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="tracker-next-action" className="text-xs font-medium text-surface-500 mb-1 block">
          {t('tracker.nextAction', 'Next action')}
        </label>
        <input
          id="tracker-next-action"
          type="text"
          value={nextAction}
          maxLength={200}
          onChange={(e) => setNextAction(e.target.value)}
          placeholder={t('tracker.nextActionPlaceholder', 'e.g. Call Mme Ngo about the interview slot')}
          className="input-field text-sm py-2"
        />
      </div>

      <div>
        <label htmlFor="tracker-follow-up" className="text-xs font-medium text-surface-500 mb-1 block">
          {t('tracker.followUpOn', 'Follow up on')}
        </label>
        <input
          id="tracker-follow-up"
          type="date"
          value={followUpDate}
          onChange={(e) => setFollowUpDate(e.target.value)}
          className="input-field text-sm py-2"
        />
        <p className="text-[11px] text-surface-400 mt-1">
          {t('tracker.followUpHelp', `Leave empty and we will suggest a follow-up ${DEFAULT_FOLLOW_UP_DAYS} days after applying.`)}
        </p>
      </div>

      {saveError && (
        <p className="text-xs text-rose-600">{saveError}</p>
      )}

      <div className="flex gap-2 justify-end">
        <button onClick={() => { setEditing(false); setSaveError(''); }} className="btn-ghost text-xs">{t('common.cancel', 'Cancel')}</button>
        <button onClick={save} disabled={saving} className="btn-primary text-xs py-1.5 px-4">
          {saving ? '...' : t('common.save', 'Save')}
        </button>
      </div>
    </div>
  );
}
