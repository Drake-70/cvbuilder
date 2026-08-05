import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ImageUploader from './ImageUploader';

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'you', 'will', 'your', 'our', 'are', 'this', 'that', 'have',
  'from', 'into', 'they', 'them', 'their', 'what', 'when', 'where', 'which', 'while', 'about',
  'being', 'been', 'were', 'was', 'not', 'but', 'who', 'whom', 'than', 'then', 'there', 'these',
  'those', 'because', 'could', 'would', 'should', 'might', 'must', 'shall', 'may', 'can', 'has',
  'had', 'having', 'does', 'did', 'doing', 'its', 'it', 'at', 'by', 'on', 'off', 'in', 'out',
  'up', 'down', 'to', 'too', 'also', 'a', 'an', 'as', 'or', 'of', 'if', 'is', 'be', 'do', 'so',
  'we', 'us', 'etc', 'via', 'per', 'job', 'role', 'position', 'candidate', 'candidates',
  'responsibilities', 'qualifications', 'requirements', 'able', 'including', 'such', 'relevant',
  'experience', 'years', 'work', 'team', 'skills', 'knowledge', 'understanding', 'strong', 'good',
  'excellent', 'ability', 'working', 'required', 'must', 'will', 'applying', 'application',
  'duties', 'tasks', 'join', 'company', 'looking', 'need', 'seek', 'seeking', 'day', 'days',
  'year', 'month', 'plus', 'etc', 'et', 'le', 'la', 'les', 'des', 'une', 'un', 'du', 'de', 'et',
  'vous', 'nous', 'sera', 'serez', 'êtes', 'est', 'sont', 'avec', 'pour', 'dans', 'sur', 'cette',
  'ce', 'ces', 'qui', 'que', 'quoi', 'dont', 'aussi', 'peut', 'doit', 'tous', 'toute', 'toutes',
  'plus', 'moins', 'entre', 'ainsi', 'poste', 'candidat', 'candidats', 'entreprise', 'équipe',
  'compétences', 'connaissances', 'expérience', 'années', 'travail', 'missions', 'responsabilités',
  'exigences', 'qualifications', 'recherchons', 'recherche', 'votre', 'vos', 'notre', 'nos',
  'profil', 'fonction', 'selon'
]);

function extractKeywords(text) {
  const words = text.toLowerCase().match(/[\wà-ÿ]+/gi) || [];
  const freq = {};
  words.forEach((w) => {
    if (w.length >= 4 && !STOPWORDS.has(w)) freq[w] = (freq[w] || 0) + 1;
  });
  return Object.entries(freq)
    .filter(([w, c]) => c >= 2 || w.length >= 6)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([w]) => w);
}

export default function JobDescriptionStep({
  jobDescription, setJobDescription, language, setLanguage, cvText,
  onSubmit, onSkip, onBack, loading
}) {
  const { t } = useTranslation('tailor');
  const { t: tCommon } = useTranslation('common');
  const [inputMode, setInputMode] = useState('text');
  const [match, setMatch] = useState(null);
  const [checking, setChecking] = useState(false);

  const cvLower = (cvText || '').toLowerCase();

  useEffect(() => {
    const jd = jobDescription.trim();
    if (jd.length < 20 || (cvText || '').trim().length < 20) {
      setMatch(null);
      setChecking(false);
      return;
    }
    setChecking(true);
    const timer = setTimeout(() => {
      const keywords = extractKeywords(jd);
      if (!keywords.length) {
        setMatch(null);
        setChecking(false);
        return;
      }
      const matched = keywords.filter((k) => cvLower.includes(k));
      setMatch({
        keywords,
        matched,
        missing: keywords.filter((k) => !matched.includes(k)),
        pct: Math.round((matched.length / keywords.length) * 100)
      });
      setChecking(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [jobDescription, cvText, cvLower]);

  const matchTone = !match ? '' : match.pct >= 70 ? 'emerald' : match.pct >= 40 ? 'amber' : 'rose';
  const matchLabel = !match ? '' : match.pct >= 70 ? t('strong_match') : match.pct >= 40 ? t('decent_match') : t('add_these_keywords');

  return (
    <div>
      <button onClick={onBack} className="btn-ghost mb-4 -ml-2">
        <svg className="w-4 h-4 mr-1 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12,19 5,12 12,5"/>
        </svg>
        {tCommon('back')}
      </button>

      <h2 className="text-2xl font-bold text-surface-900 mb-1">{t('job_description')}</h2>
      <p className="text-surface-500 text-sm mb-6">{t('job_description_hint')}</p>

      <div className="jd-form space-y-5">
        {/* Language selector */}
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1.5">{t('language_selection')}</label>
          <div className="flex gap-1 p-1 bg-surface-100 rounded-xl">
            <button
              onClick={() => setLanguage('en')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all duration-200 ${
                language === 'en' ? 'bg-surface-0 text-surface-900 shadow-sm' : 'text-surface-500 hover:text-surface-700'
              }`}
            >
              English
            </button>
            <button
              onClick={() => setLanguage('fr')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all duration-200 ${
                language === 'fr' ? 'bg-surface-0 text-surface-900 shadow-sm' : 'text-surface-500 hover:text-surface-700'
              }`}
            >
              Fran&ccedil;ais
            </button>
          </div>
        </div>

        {/* Input mode toggle */}
        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1.5">{t('input_method', 'Input method')}</label>
          <div className="flex gap-1 p-1 bg-surface-100 rounded-xl">
            <button
              onClick={() => setInputMode('text')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all duration-200 ${
                inputMode === 'text' ? 'bg-surface-0 text-surface-900 shadow-sm' : 'text-surface-500 hover:text-surface-700'
              }`}
            >
              {t('pasteText', 'Paste Text')}
            </button>
            <button
              onClick={() => setInputMode('image')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all duration-200 ${
                inputMode === 'image' ? 'bg-surface-0 text-surface-900 shadow-sm' : 'text-surface-500 hover:text-surface-700'
              }`}
            >
              {t('uploadImage', 'Upload Image')}
            </button>
          </div>
        </div>

        {/* Job description input */}
        {inputMode === 'text' ? (
          <div>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder={t('job_description_placeholder')}
              rows={10}
              className="input-field resize-y min-h-[180px]"
            />
            <div className="text-xs text-surface-400 mt-1.5">
              {jobDescription.length > 0 && t('word_count', { count: jobDescription.split(/\s+/).filter(Boolean).length })}
            </div>

            {!match && !checking && jobDescription.trim().length >= 15 && (
              <p className="text-xs text-surface-400 mt-1.5">{t('match_hint')}</p>
            )}

            {match && (
              <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50/60 dark:bg-surface-800/60 p-4 animate-fade-in">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-surface-500">{t('live_match')}</p>
                  <span className={`text-xs font-bold ${
                    matchTone === 'emerald' ? 'text-emerald-600 dark:text-emerald-400'
                    : matchTone === 'amber' ? 'text-amber-600 dark:text-amber-400'
                    : 'text-rose-600 dark:text-rose-400'
                  }`}>
                    {matchLabel}
                  </span>
                </div>
                <div className="h-1.5 bg-surface-200 dark:bg-surface-700 rounded-full overflow-hidden mb-2">
                  <div className={`h-full rounded-full transition-all duration-700 ${
                    matchTone === 'emerald' ? 'bg-emerald-500'
                    : matchTone === 'amber' ? 'bg-amber-500'
                    : 'bg-rose-500'
                  }`} style={{ width: `${match.pct}%` }} />
                </div>
                <p className="text-xs text-surface-500 mb-2">
                  {t('keywords_covered', { covered: match.matched.length, total: match.keywords.length })}
                </p>
                {match.missing.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-surface-500 mb-1">{t('missing_keywords')}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {match.missing.map((k) => (
                        <span key={k} className="text-[11px] bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40 rounded-full px-2 py-0.5">{k}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div>
            <ImageUploader onTextExtracted={(text) => setJobDescription(text)} />
            {jobDescription && (
              <div className="mt-3">
                <label className="block text-xs font-medium text-surface-500 mb-1">{t('extractedText', 'Extracted text')}</label>
                <textarea
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  rows={8}
                  className="input-field resize-y min-h-[140px]"
                />
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={onSubmit}
            disabled={loading || !jobDescription.trim()}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                {t('tailoring')}
              </>
            ) : (
              <>
                {tCommon('submit')}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12,5 19,12 12,19"/>
                </svg>
              </>
            )}
          </button>

          <button
            onClick={onSkip}
            disabled={loading}
            className="btn-secondary flex items-center justify-center gap-1.5"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5,3 19,12 5,21 5,3"/>
            </svg>
            {t('skip_job')}
          </button>
        </div>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="fixed inset-0 bg-surface-900/20 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in">
          <div className="bg-surface-0 rounded-2xl p-8 shadow-2xl text-center max-w-sm mx-4 animate-scale-in">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center mx-auto mb-5">
              <svg className="animate-spin h-7 w-7 text-white" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            </div>
            <h3 className="font-bold text-surface-900 text-lg mb-1">{t('tailoring')}</h3>
            <p className="text-sm text-surface-500">{t('tailoring_desc')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
