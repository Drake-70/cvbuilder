import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

/**
 * Job-description-independent resume quality report.
 *
 * This is a different instrument from ATSScoreCard, not a second view of it.
 * ATSScoreCard answers "how well does this CV match THIS job" and is meaningless
 * without a job description; this one answers "is this CV any good at all" and
 * runs on a bare CV. A user who skips the job description on the tailor path
 * used to get nothing at all.
 *
 * Two decisions worth knowing:
 *
 * - It fetches on mount rather than behind a button. The endpoint makes no AI
 *   call, so there is nothing to pay for and nothing to wait for; a button here
 *   would only add a click between a user and their own report.
 *
 * - Finding codes are localised through `resumeScore.findings.<code>`, and the
 *   backend suite asserts that every code it can emit exists in both locale
 *   files. If a code ever goes missing the user sees a neutral placeholder
 *   rather than a raw identifier like "impact.few_quantified".
 */
export default function ResumeScoreCard({ cvText, tailoredCV }) {
  const { t } = useTranslation();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requested = useRef(false);

  const hasText = typeof cvText === 'string' && cvText.trim().length > 0;
  const hasStructured = Boolean(tailoredCV && typeof tailoredCV === 'object');

  const fetchReport = useCallback(async () => {
    if (!hasText && !hasStructured) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/score/resume', { cvText, tailoredCV });
      setReport(res.data);
    } catch (err) {
      // Surfaced rather than swallowed: a silently absent score reads as
      // "nothing to improve", which is the one reading that would be a lie.
      setError(err.response?.data?.error || t('tailor.resumeScore.failed', 'Could not score this CV.'));
    } finally {
      setLoading(false);
    }
  }, [cvText, tailoredCV, hasText, hasStructured, t]);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    fetchReport();
  }, [fetchReport]);

  // Neither source present: nothing to report, and nothing worth an empty card.
  if (!hasText && !hasStructured) return null;

  const tone = (s) => (s >= 80 ? 'text-emerald-500' : s >= 60 ? 'text-amber-500' : 'text-rose-500');
  const bar = (s) => (s >= 80 ? 'bg-emerald-500' : s >= 60 ? 'bg-amber-500' : 'bg-rose-500');
  const ring = (s) => (s >= 80 ? 'stroke-emerald-500' : s >= 60 ? 'stroke-amber-500' : 'stroke-rose-500');

  const circumference = 2 * Math.PI * 42;
  const offset = report ? circumference - (report.score / 100) * circumference : circumference;

  const findings = (report?.categories || []).flatMap((c) => c.findings || []);

  const labelFor = (finding) => {
    const key = `tailor.resumeScore.findings.${finding.code}`;
    // A code with no translation renders as its own key; show something neutral
    // instead of leaking an internal identifier into the UI.
    const text = t(key, finding.params);
    return text === key ? t('tailor.resumeScore.generic_finding', 'Could not be displayed.') : text;
  };

  return (
    <div className="card p-5 animate-slide-up">
      <div className="flex items-center justify-between mb-1">
        <h3 className="kicker">{t('tailor.resumeScore.title', 'Resume quality')}</h3>
        {report && (
          <button
            onClick={fetchReport}
            disabled={loading}
            className="btn-ghost text-xs text-brand-600 font-medium"
            title={t('tailor.resumeScore.rescore', 'Recalculate')}
          >
            {loading
              ? t('tailor.resumeScore.calculating', 'Scoring...')
              : t('tailor.resumeScore.rescore', 'Recalculate')}
          </button>
        )}
      </div>
      <p className="text-xs text-surface-500 mb-4">
        {t('tailor.resumeScore.subtitle', 'How your CV reads on its own. No job description needed.')}
      </p>

      {error && <p className="text-rose-500 text-sm">{error}</p>}
      {!report && !error && (
        <p className="text-xs text-surface-400">
          {t('tailor.resumeScore.calculating', 'Scoring...')}
        </p>
      )}

      {report && (
        <div className="animate-fade-in">
          <div className="flex items-center gap-6 mb-5">
            <div className="relative w-24 h-24 flex-shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="#e2e8f0" strokeWidth="8" />
                <circle
                  cx="50" cy="50" r="42" fill="none"
                  className={ring(report.score)}
                  strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                  style={{ transition: 'stroke-dashoffset 1s ease-out' }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-2xl font-bold ${tone(report.score)}`}>{report.score}</span>
              </div>
            </div>

            <div className="flex-1 space-y-2">
              {report.categories.map((c) => (
                <div key={c.key}>
                  <div className="flex justify-between text-xs text-surface-500 mb-0.5">
                    <span>{t(`tailor.resumeScore.categories.${c.key}`, c.key)}</span>
                    <span>{t('tailor.resumeScore.points', '{{score}}/{{max}}', { score: c.score, max: c.max })}</span>
                  </div>
                  <div className="h-1.5 bg-surface-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${bar(c.score)}`}
                      style={{ width: `${c.max ? (c.score / c.max) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {findings.length === 0 ? (
            <div className="bg-emerald-50/60 rounded-xl p-3.5">
              <p className="text-xs text-emerald-700">
                {t('tailor.resumeScore.noFindings', 'Nothing to flag. This reads well.')}
              </p>
            </div>
          ) : (
            <div className="bg-brand-50/50 rounded-xl p-3.5">
              <p className="text-xs font-medium text-brand-700 mb-2">
                {t('tailor.resumeScore.findingsTitle', '{{count}} things to improve', { count: findings.length })}
              </p>
              <ul className="space-y-1.5">
                {findings.map((f, i) => (
                  <li key={`${f.code}-${i}`} className="text-xs text-surface-600 flex items-start gap-2">
                    <span className="text-brand-400 mt-0.5 flex-shrink-0">•</span>
                    {labelFor(f)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}