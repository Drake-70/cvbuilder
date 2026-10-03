import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { summarizeDiff, KEPT, REWORDED, ADDED, REMOVED } from '../utils/cvDiff';

/**
 * Review-before-save: an explicit list of what the tailoring changed, and the
 * approval gate that stands between it and the user's document library.
 *
 * This exists because the two things the result step already had did not cover
 * it. BeforeAfterGaps shows two full CVs side by side for the user to eyeball,
 * which answers "what does mine look like now" rather than "what did the AI do
 * to it" -- and it renders nothing at all when `gapAnalysis` is empty, so a
 * tailoring that found no gaps showed no before/after. Meanwhile
 * `TailorPage.handleTailor` had already written the document, with the save
 * error swallowed as "Non-critical".
 *
 * So the gate is real here: nothing is persisted until the user presses save,
 * and a failed save says so instead of disappearing.
 */
export default function ChangeReview({ originalCV, tailoredCV, onSave, disabled = false }) {
  const { t } = useTranslation('tailor');
  const [showKept, setShowKept] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [saveState, setSaveState] = useState('idle');
  const [saveError, setSaveError] = useState('');

  const diff = useMemo(
    () => summarizeDiff(originalCV, tailoredCV),
    [originalCV, tailoredCV]
  );

  const changedRoles = useMemo(
    () => diff.roles.filter(r => r.isNew || r.status === REMOVED || r.bullets.some(b => b.status !== KEPT)),
    [diff]
  );

  const handleSave = async () => {
    if (saveState === 'saving' || saveState === 'saved') return;
    setSaveState('saving');
    setSaveError('');
    try {
      await onSave();
      setSaveState('saved');
    } catch (err) {
      // Surfaced, never swallowed. The old flow marked this save "Non-critical"
      // and moved on, so a user could believe their CV was filed when it was not.
      setSaveState('error');
      setSaveError(err?.message || err?.response?.data?.error || t('reviewChanges.save_failed', 'Could not save.'));
    }
  };

  const styleFor = (status) => ({
    [KEPT]: 'text-surface-400',
    [REWORDED]: 'text-amber-600 dark:text-amber-400',
    [ADDED]: 'text-emerald-600 dark:text-emerald-400',
    [REMOVED]: 'text-rose-500 line-through'
  }[status]);

  const markerFor = (status) => ({
    [KEPT]: '=',
    [REWORDED]: '~',
    [ADDED]: '+',
    [REMOVED]: '-'
  }[status]);

  const labelFor = (status) => ({
    [KEPT]: t('reviewChanges.kept', 'Unchanged'),
    [REWORDED]: t('reviewChanges.reworded', 'Rewritten'),
    [ADDED]: t('reviewChanges.added', 'Added'),
    [REMOVED]: t('reviewChanges.removed', 'Removed')
  }[status]);

  const renderBullet = (bullet, key) => {
    const isPair = bullet.status === REWORDED;
    const body = (
      <>
        <div className="flex items-start gap-2">
          <span className={`text-xs font-mono flex-shrink-0 w-3 ${styleFor(bullet.status)}`}>
            {markerFor(bullet.status)}
          </span>
          <div className="min-w-0 flex-1">
            {isPair ? (
              <>
                <p className="text-xs text-surface-400">{bullet.before}</p>
                <p className="text-xs text-surface-700 dark:text-surface-200">{bullet.after}</p>
              </>
            ) : bullet.status === REMOVED ? (
              <p className="text-xs text-surface-400">{bullet.before}</p>
            ) : (
              <p className="text-xs text-surface-700 dark:text-surface-200">{bullet.after}</p>
            )}
            {bullet.status !== KEPT && (
              <span className={`text-[10px] uppercase tracking-wide ${styleFor(bullet.status)}`}>
                {labelFor(bullet.status)}
              </span>
            )}
          </div>
        </div>
      </>
    );

    if (!isPair) return <li key={key} className="py-1">{body}</li>;

    return (
      <li key={key} className="py-1">
        <button
          type="button"
          onClick={() => setExpanded(e => ({ ...e, [key]: !e[key] }))}
          className="w-full text-left"
          aria-expanded={Boolean(expanded[key])}
        >
          {body}
        </button>
      </li>
    );
  };

  const saveButton = (
    <div className="mt-5 pt-4 border-t border-surface-100 dark:border-surface-700">
      {saveState === 'saved' ? (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">
          {t('reviewChanges.saved', 'Saved to your documents.')}
        </p>
      ) : (
        <>
          <button
            onClick={handleSave}
            disabled={disabled || saveState === 'saving'}
            className="btn-primary w-full"
          >
            {saveState === 'saving'
              ? t('reviewChanges.saving', 'Saving...')
              : t('reviewChanges.save', 'Save to my documents')}
          </button>
          {saveError && (
            <div className="mt-2 flex items-start justify-between gap-3">
              <p className="text-xs text-rose-500">
                {t('reviewChanges.save_failed', 'Could not save: {{error}}', { error: saveError })}
              </p>
              <button onClick={handleSave} className="btn-ghost text-xs flex-shrink-0">
                {t('reviewChanges.save_retry', 'Try again')}
              </button>
            </div>
          )}
          {!saveError && (
            <p className="mt-2 text-xs text-surface-400">
              {t('reviewChanges.save_hint', 'Nothing is saved until you press this.')}
            </p>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className="card p-5">
      <h3 className="kicker mb-1">{t('reviewChanges.title', 'What changed')}</h3>
      <p className="text-xs text-surface-500 mb-4">
        {t('reviewChanges.subtitle', 'Review every change below before it is saved to your documents.')}
      </p>

      {diff.incomparable ? (
        <>
          <p className="text-xs text-surface-500 bg-surface-50 rounded-lg p-3">
            {t(
              'reviewChanges.incomparable',
              'Your CV was pasted as plain text, so there is no structured version to compare against. Review the tailored CV itself before saving.'
            )}
          </p>
          {saveButton}
        </>
      ) : !diff.changed ? (
        <>
          <p className="text-xs text-surface-500 bg-surface-50 rounded-lg p-3">
            {t('reviewChanges.nothing_changed', 'Nothing was changed by this tailoring.')}
          </p>
          {saveButton}
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {diff.reworded > 0 && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                {t('reviewChanges.reworded', 'Rewritten')} {diff.reworded}
              </span>
            )}
            {diff.added > 0 && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                {t('reviewChanges.added', 'Added')} {diff.added}
              </span>
            )}
            {diff.removed > 0 && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300">
                {t('reviewChanges.removed', 'Removed')} {diff.removed}
              </span>
            )}
            {diff.newRoles > 0 && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
                {t('reviewChanges.roles_added', { count: diff.newRoles })}
              </span>
            )}
            {diff.summaryChanged && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-300">
                {t('reviewChanges.summary_rewritten', 'Summary rewritten')}
              </span>
            )}
            {diff.skillsAdded.length > 0 && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-300">
                {t('reviewChanges.skills_added', '+{{count}} skills', { count: diff.skillsAdded.length })}
              </span>
            )}
          </div>

          <div className="space-y-4">
            {changedRoles.map((role, ri) => {
              const visible = showKept ? role.bullets : role.bullets.filter(b => b.status !== KEPT);
              if (!visible.length && !role.isNew && role.status !== REMOVED) return null;
              return (
                <div key={`${role.title}-${ri}`}>
                  <p className="text-sm font-medium text-surface-800 dark:text-surface-100">
                    {role.title}
                    {role.isNew && (
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-emerald-600">
                        {t('reviewChanges.new_role', 'New role')}
                      </span>
                    )}
                  </p>
                  {role.originalTitle && role.originalTitle !== role.title && (
                    <p className="text-xs text-surface-400">{role.originalTitle}</p>
                  )}
                  {visible.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">{visible.map((b, bi) => renderBullet(b, `${ri}-${bi}`))}</ul>
                  )}
                </div>
              );
            })}
          </div>

          {diff.kept > 0 && (
            <button
              onClick={() => setShowKept(s => !s)}
              className="btn-ghost text-xs mt-4"
            >
              {showKept
                ? t('reviewChanges.hide_kept', 'Hide {{count}} unchanged lines', { count: diff.kept })
                : t('reviewChanges.show_kept', 'Show {{count}} unchanged lines', { count: diff.kept })}
            </button>
          )}

          {saveButton}
        </>
      )}
    </div>
  );
}
