import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { classifyProposal, EXPANDED, SKIPPED } from '../utils/cvDiff';

/**
 * Bullet-level approval for the expansion helper.
 *
 * The helper used to replace every line the user had typed with the model's
 * rewrite in one step, and swallow the error, so the only record of what it had
 * done was the text itself. This panel is that record: each line as written
 * beside the line as proposed, kept by default but individually reversible, and
 * nothing touches the form until Apply is pressed.
 *
 * Lines the model declined to expand are shown as such rather than hidden.
 * Dropping them would read as "this line is gone", which is a different and
 * wrong claim from "your wording was kept".
 */
export default function BulletApproval({ proposals, accepted, onToggle, onAcceptAll, onApply, onDiscard, error }) {
  const { t } = useTranslation('tailor');

  const rows = useMemo(
    () => (Array.isArray(proposals) ? proposals : []).map((p, i) => ({
      ...p,
      // Bookkeeping is by position, not by `p.index`. applyProposals walks the
      // editable list consuming an index per filled row, so position is the
      // coordinate the write actually uses; trusting the server's own index
      // here would be a second, subtly different pairing.
      position: i,
      key: `${p.index}-${i}`,
      status: classifyProposal(p.before, p.after)
    })),
    [proposals]
  );

  const expanded = rows.filter(r => r.status === EXPANDED);
  const skipped = rows.filter(r => r.status === SKIPPED);

  if (!rows.length) {
    // An error with nothing to show. Without this the panel would be absent and
    // the failure invisible, which is exactly how the old silent catch behaved.
    if (!error) return null;
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3.5">
        <p className="text-sm text-rose-700">{error}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50/30 p-3.5 space-y-3">
      <div>
        <p className="text-sm font-medium text-brand-900">
          {t('bulletReview.title', 'Review the rewrites')}
        </p>
        <p className="text-xs text-brand-700/80 mt-0.5">
          {t('bulletReview.subtitle', 'Your wording is kept unless you accept a rewrite.')}
        </p>
      </div>

      {error && (
        <p className="text-xs text-rose-600 bg-rose-50 rounded-lg px-2.5 py-2">{error}</p>
      )}

      <ul className="space-y-2">
        {rows.map(row => {
          const isAccepted = accepted.has(row.position) && row.status === EXPANDED;

          if (row.status === SKIPPED) {
            return (
              <li key={row.key} className="text-xs text-surface-500 flex items-start gap-2">
                <span className="font-mono text-surface-400 flex-shrink-0 w-3">=</span>
                <span className="min-w-0">
                  {row.before}
                  <span className="block text-surface-400 mt-0.5">
                    {t('bulletReview.left_as_written', 'Kept as you wrote it')}
                  </span>
                </span>
              </li>
            );
          }

          return (
            <li key={row.key} className="rounded-lg border border-surface-100 bg-surface-0 p-2.5">
              <p className="text-xs text-surface-400 line-through decoration-surface-300">
                {row.before}
              </p>
              <p className="text-xs text-surface-800 dark:text-surface-100 mt-1 mb-2">
                {row.after}
              </p>
              <button
                type="button"
                onClick={() => onToggle(row.position)}
                className={`text-[11px] px-2 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                  isAccepted
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
                }`}
              >
                {isAccepted
                  ? t('bulletReview.accepted', 'Accepted')
                  : t('bulletReview.use_this', 'Use this rewrite')}
              </button>
            </li>
          );
        })}
      </ul>

      {skipped.length > 0 && (
        <p className="text-[11px] text-surface-400">
          {t('bulletReview.skipped_note', {
            count: skipped.length,
            defaultValue: '{{count}} line could not be rewritten and was left alone.'
          })}
        </p>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <button type="button" onClick={onAcceptAll} className="btn-ghost text-xs" disabled={!expanded.length}>
          {t('bulletReview.accept_all', 'Accept all')}
        </button>
        <button type="button" onClick={onDiscard} className="btn-ghost text-xs">
          {t('bulletReview.discard', 'Discard all')}
        </button>
        <button type="button" onClick={onApply} className="btn-primary text-xs ml-auto">
          {t('bulletReview.apply', 'Apply accepted')}
        </button>
      </div>
    </div>
  );
}