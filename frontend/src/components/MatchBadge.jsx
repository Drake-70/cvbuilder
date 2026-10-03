import { useTranslation } from 'react-i18next';

// Bands match JobDescriptionStep's live keyword check (70 / 40) so a user's
// "strong match" reading is the same one in both places.
//
// A job with too little description gets no badge at all rather than a low one:
// the scorer returns `score: null` for those, and a badge that sometimes means
// "poor fit" and sometimes means "we could not tell" is worse than silence.
const STRONG = 70;
const DECENT = 40;

/**
 * How well the signed-in user's saved CV lines up with a posting.
 *
 * Renders nothing when there is no score to show -- no user, no CV, or a posting
 * too thin to judge. Those are three different situations and none of them is a
 * low match.
 */
export default function MatchBadge({ match, cvLabel, detailed = false }) {
  const { t } = useTranslation('jobs');

  if (!match || match.insufficient || typeof match.score !== 'number') return null;

  const tone = match.score >= STRONG
    ? { text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30', bar: 'bg-emerald-500' }
    : match.score >= DECENT
      ? { text: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30', bar: 'bg-amber-500' }
      : { text: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-900/30', bar: 'bg-rose-400' };

  const label = match.score >= STRONG
    ? t('match.strong', 'Strong match')
    : match.score >= DECENT
      ? t('match.decent', 'Some overlap')
      : t('match.weak', 'Little overlap');

  const { matchedKeywords, jdKeywords } = match.counts;

  if (!detailed) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-[11px] font-medium rounded-full px-2 py-0.5 ${tone.text} ${tone.bg}`}
        title={t('match.against', { cv: cvLabel || t('match.your_cv', 'your CV') })}
      >
        <span className="font-mono">{match.score}</span>
        <span className="opacity-80">·</span>
        <span>{label}</span>
      </span>
    );
  }

  return (
    <div className={`rounded-xl p-3.5 ${tone.bg}`}>
      <div className="flex items-center justify-between gap-3">
        <p className={`text-sm font-semibold ${tone.text}`}>{label}</p>
        <p className={`text-lg font-bold font-mono ${tone.text}`}>{match.score}</p>
      </div>

      <div className="mt-2 h-1.5 rounded-full bg-surface-200 dark:bg-surface-700 overflow-hidden">
        <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${match.score}%` }} />
      </div>

      <p className="text-xs text-surface-600 dark:text-surface-300 mt-2">
        {t('match.keywords_covered', { covered: matchedKeywords, total: jdKeywords })}
      </p>

      {match.breakdown.skills !== null && (
        <p className="text-xs text-surface-600 dark:text-surface-300 mt-0.5">
          {t('match.skills_covered', {
            covered: match.counts.matchedSkills,
            total: match.counts.jdSkills
          })}
        </p>
      )}

      <p className="text-[11px] text-surface-500 dark:text-surface-400 mt-2">
        {t('match.against', { cv: cvLabel || t('match.your_cv', 'your CV') })}
      </p>
      <p className="text-[11px] text-surface-500 dark:text-surface-400 mt-0.5">
        {t('match.what_it_means')}
      </p>

      {match.keywords.missing.length > 0 && (
        <div className="mt-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-surface-500">
            {t('match.missing')}
          </p>
          <div className="flex flex-wrap gap-1 mt-1">
            {match.keywords.missing.slice(0, 12).map((kw) => (
              <span
                key={kw}
                className="text-[10px] px-1.5 py-0.5 rounded bg-surface-0 text-surface-600 dark:text-surface-300 border border-surface-200 dark:border-surface-600"
              >
                {kw}
              </span>
            ))}
            {match.keywords.missing.length > 12 && (
              <span className="text-[10px] text-surface-400 self-center">
                {t('match.and_more', { count: match.keywords.missing.length - 12 })}
              </span>
            )}
          </div>
          {match.keywords.truncated && (
            <p className="text-[10px] text-surface-400 mt-1">{t('match.list_truncated')}</p>
          )}
        </div>
      )}
    </div>
  );
}