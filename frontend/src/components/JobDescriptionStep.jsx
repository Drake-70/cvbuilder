import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { gsap } from 'gsap';
import ImageUploader from './ImageUploader';

export default function JobDescriptionStep({
  jobDescription, setJobDescription, language, setLanguage,
  onSubmit, onSkip, onBack, loading
}) {
  const { t } = useTranslation('tailor');
  const { t: tCommon } = useTranslation('common');
  const [inputMode, setInputMode] = useState('text');

  const animRef = useRef(null);
  useEffect(() => {
    const el = animRef.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      gsap.from(el.querySelector('h2, p, .jd-form'), {
        opacity: 0, y: 20, duration: 0.4, stagger: 0.08, ease: 'power2.out'
      });
    }, el);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={animRef}>
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
              {jobDescription.length > 0 && `${jobDescription.split(/\s+/).filter(Boolean).length} words`}
            </div>
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
