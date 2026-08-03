import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import CVPreview from './CVPreview';
import { analyzeGaps, highlightText } from '../utils/gapKeywords';

export default function BeforeAfterGaps({ originalText, originalCV, tailoredCV, coverLetter, gaps = [], language = 'en' }) {
  const { t } = useTranslation('tailor');
  const [selected, setSelected] = useState('all'); // 'all' | index | null

  const analyzed = useMemo(
    () => analyzeGaps(gaps, tailoredCV, coverLetter),
    [gaps, tailoredCV, coverLetter]
  );

  const activeTerms = useMemo(() => {
    if (selected === null) return [];
    if (selected === 'all') return analyzed.flatMap((a) => a.matched);
    return analyzed[selected]?.matched || [];
  }, [selected, analyzed]);

  const chipClass = (isActive, matched) =>
    `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all border ${
      isActive
        ? matched
          ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-600/50 dark:text-emerald-300'
          : 'bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-900/30 dark:border-amber-600/50 dark:text-amber-300'
        : 'bg-surface-0 border-surface-200 text-surface-500 hover:border-surface-300 dark:bg-surface-800 dark:border-surface-700 dark:text-surface-400'
    }`;

  if (!gaps.length) return null;

  const beforeSheet = originalCV
    ? <CVPreview cv={originalCV} language={language} highlightTerms={activeTerms} markClass="cv-hl-before" />
    : (
      <div className="cv-preview cv-preview--plain">
        {highlightText(originalText, activeTerms, 'cv-hl-before')}
      </div>
    );

  return (
    <div className="animate-fade-in">
      <p className="text-sm text-surface-500 dark:text-surface-400 mb-4">{t('gap_diff_hint')}</p>

      {/* Gap chips — the gaps are shown first */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setSelected('all')}
          className={chipClass(selected === 'all', true)}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20,6 9,17 4,12"/></svg>
          {t('gap_all')}
        </button>
        <button onClick={() => setSelected(null)} className={chipClass(selected === null, true)}>
          {t('gap_none')}
        </button>
        {analyzed.map((a, i) => (
          <button
            key={i}
            onClick={() => setSelected(selected === i ? 'all' : i)}
            className={chipClass(selected === i, a.matched.length > 0)}
            title={a.gap}
          >
            {a.matched.length > 0 ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500 flex-shrink-0"><polyline points="20,6 9,17 4,12"/></svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500 flex-shrink-0"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            )}
            <span className="max-w-[16rem] truncate">{a.gap}</span>
          </button>
        ))}
      </div>

      {/* Before — original CV on an A4 sheet */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <span className="badge badge-rose">{t('gap_before')}</span>
          {activeTerms.length > 0 && (
            <span className="text-[10px] font-medium uppercase tracking-wider text-amber-500">{t('gap_reused_hint')}</span>
          )}
        </div>
        <div className="a4-sheet">{beforeSheet}</div>
      </div>

      {/* After — tailored CV on an A4 sheet */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="badge badge-emerald">{t('gap_after')}</span>
          {activeTerms.length > 0 && (
            <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-500">{t('gap_added_hint')}</span>
          )}
        </div>
        <div className="a4-sheet">
          <CVPreview cv={tailoredCV} language={language} highlightTerms={activeTerms} />
        </div>
      </div>

      {/* Gap that needs user input */}
      {selected !== null && selected !== 'all' && analyzed[selected]?.matched.length === 0 && (
        <div className="mt-5 flex items-start gap-3 p-3 rounded-xl bg-amber-50/80 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-700/40 animate-scale-in">
          <div className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-800/40 flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600 dark:text-amber-300"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">{t('gap_needs_input')}</p>
            <p className="text-xs text-amber-600/90 dark:text-amber-400 mt-0.5">{t('gap_needs_input_desc')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
