import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import analytics from '../utils/analytics';
import PathChoice from '../components/PathChoice';
import UploadStep from '../components/UploadStep';
import BuildStep from '../components/BuildStep';
import JobDescriptionStep from '../components/JobDescriptionStep';
import ResultStep from '../components/ResultStep';
import { draftIsResumable, normalizeDraftStep, describeDraft } from '../utils/draftResume';

export default function TailorPage() {
  const { i18n, t } = useTranslation('tailor');
  const { t: tCommon } = useTranslation('common');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, fetchUser } = useAuth();
  const { toast } = useToast();
  const initialPath = searchParams.get('path') || null;
  const retTailorId = searchParams.get('retailor') || null;
  // Set by the dashboard's draft card so reaching the wizard is one click rather
  // than click-then-confirm. Explicit visits still get the choice.
  const autoResume = searchParams.get('resume') === '1';

  const [step, setStep] = useState(initialPath ? (initialPath === 'build' ? 'build' : 'upload') : 'choose');
  const [sourcePath, setSourcePath] = useState(initialPath === 'build' ? 'build' : 'upload');
  const [cvText, setCvText] = useState('');
  const [originalCV, setOriginalCV] = useState(null);
  const [savedCvId, setSavedCvId] = useState(null);
  const [savedDocId, setSavedDocId] = useState(null);
  const [jobDescription, setJobDescription] = useState('');
  const [language, setLanguage] = useState(i18n.language?.startsWith('fr') ? 'fr' : 'en');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [flowKey, setFlowKey] = useState(0);

  // The build questionnaire's answers, reported up by `BuildStep`. Before this
  // existed the questionnaire was unreachable from the parent, so the autosave
  // could only ever record which step the user was on.
  const [buildState, setBuildState] = useState(null);
  // Whether the questionnaire holds anything the user did, as opposed to just the
  // account profile pre-filled into it. An untouched questionnaire is not saved:
  // opening the wizard is not progress.
  const [buildTouched, setBuildTouched] = useState(false);
  // A one-shot seed handed to `BuildStep` when a draft is resumed. It is set
  // once and cleared on reset, because `BuildStep` applies it exactly once.
  const [buildSeed, setBuildSeed] = useState(null);

  // A resumable draft waiting for the user to choose whether to open it.
  // Restoring silently used to be the behaviour, which meant arriving at
  // `/tailor` could teleport the user into the middle of a questionnaire they
  // had forgotten starting, with no explanation and no way back.
  const [draft, setDraft] = useState(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftLoadFailed, setDraftLoadFailed] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  // The `?resume=1` handoff. The fetched draft goes in a ref and a tick counter
  // drives the effect that applies it, because the fetch resolves before `draft`
  // state exists and `handleResumeDraft` reads from state.
  const autoResumeRef = useRef(autoResume);
  const pendingDraftRef = useRef(null);
  const [autoResumeTick, setAutoResumeTick] = useState(0);

  const stepStage = { build: 0, upload: 0, job: 1, result: 2 };
  const currentStage = stepStage[step] ?? -1;
  const steps = [
    { label: t('step_cv') },
    { label: t('step_job') },
    { label: t('step_result') }
  ];

  // Look for a draft worth opening on a fresh visit.
  //
  // Only the server's `resumable` verdict counts. The five drafts in the
  // production database all named a step and held nothing else; treating those
  // as drafts is what made the feature look broken.
  useEffect(() => {
    if (!user) return;
    if (initialPath || retTailorId) {
      setDraftLoaded(true);
      return;
    }
    let cancelled = false;
    api.get('/drafts')
      .then((res) => {
        if (cancelled) return;
        setDraftLoaded(true);
        if (!res.data?.exists || !res.data.resumable) return;
        // `?resume=1` means the user already chose to continue by clicking
        // through from the dashboard, so applying it here is not a surprise.
        // Otherwise hold it and let them decide.
        if (autoResumeRef.current) {
          pendingDraftRef.current = res.data;
          setAutoResumeTick((n) => n + 1);
        } else {
          setDraft(res.data);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setDraftLoaded(true);
        setDraftLoadFailed(true);
      });
    return () => { cancelled = true; };
  }, [user, initialPath, retTailorId]);

  const handleBuildStateChange = useCallback((next, touched) => {
    setBuildState(next);
    setBuildTouched(Boolean(touched));
  }, []);

  const handleResumeDraft = useCallback(() => {
    const source = draft || pendingDraftRef.current;
    if (!source) return;
    const restoredStep = normalizeDraftStep(source.step);
    if (restoredStep !== 'choose') setStep(restoredStep);
    if (source.sourcePath) setSourcePath(source.sourcePath);
    if (source.cvText) setCvText(source.cvText);
    if (source.originalCV) setOriginalCV(source.originalCV);
    if (source.savedCvId) setSavedCvId(source.savedCvId);
    if (source.savedDocId) setSavedDocId(source.savedDocId);
    if (source.jobDescription) setJobDescription(source.jobDescription);
    if (source.language) setLanguage(source.language);
    setBuildState(source.buildState || null);
    setBuildSeed(source.buildState || null);
    // A resumed questionnaire is by definition something the user did.
    setBuildTouched(Boolean(source.buildState));
    pendingDraftRef.current = null;
    setDraft(null);
    setDraftLoadFailed(false);
    setError('');
    analytics.track('draft_resumed', { step: restoredStep, auto: !draft });
  }, [draft]);

  // Apply a draft the fetch already handed over because the visit was a
  // `?resume=1` handoff from the dashboard.
  useEffect(() => {
    if (autoResumeTick === 0) return;
    handleResumeDraft();
  }, [autoResumeTick, handleResumeDraft]);

  const handleDiscardDraft = useCallback(async () => {
    if (!draft) return;
    setDiscarding(true);
    try {
      await api.delete('/drafts');
      pendingDraftRef.current = null;
      setDraft(null);
      analytics.track('draft_discarded', { step: draft.step });
    } catch (err) {
      toast.error(tCommon('error'), err.response?.data?.error || 'Could not discard the draft. Try again.');
    } finally {
      setDiscarding(false);
    }
  }, [draft, toast, tCommon]);

  // Autosave draft (debounced) while the user is mid-wizard.
  //
  // The gate is "does this hold anything worth reopening", the same question the
  // server answers on read. Previously the only exclusion was the `choose` step,
  // so clicking "Start building" and closing the tab wrote a draft containing
  // nothing but the string `build`.
  useEffect(() => {
    if (!user || result || !draftLoaded) return;
    const payload = {
      step,
      sourcePath,
      cvText,
      originalCV,
      savedCvId,
      savedDocId,
      jobDescription,
      language,
      // An untouched questionnaire is left out entirely, so opening the wizard and
      // walking away writes nothing rather than a draft that is only the
      // account profile.
      ...(step === 'build' && buildTouched ? { buildState } : {})
    };
    if (!draftIsResumable(payload)) return;
    const timer = setTimeout(() => {
      api.put('/drafts', payload).catch(() => {
        // A failed autosave is surfaced rather than swallowed: telling the user
        // their work is being saved when it is not is worse than a visible error.
        setDraftLoadFailed(true);
      });
    }, 1200);
    return () => clearTimeout(timer);
  }, [
    user,
    result,
    draftLoaded,
    step,
    sourcePath,
    cvText,
    originalCV,
    savedCvId,
    savedDocId,
    jobDescription,
    language,
    buildState,
    buildTouched
  ]);

  const handlePathChoice = (path) => {
    setStep(path);
    setSourcePath(path);
    pendingDraftRef.current = null;
    setDraft(null);
    setDraftLoadFailed(false);
    setError('');
  };

  const handleCvReady = useCallback(async (text, source, parsedSections) => {
    setCvText(text);
    setOriginalCV(parsedSections || null);
    setStep('job');
    setError('');

    // Save CV to backend
    try {
      const res = await api.post('/cv/save', {
        originalText: text,
        parsedSections: parsedSections || null,
        source: source || 'upload'
      });
      setSavedCvId(res.data._id);
    } catch {
      // Non-critical, proceed without saving
    }
  }, []);

  const handleTailor = async (skipJob = false) => {
    setLoading(true);
    setError('');
    try {
      const jd = skipJob ? '' : jobDescription;
      const res = await api.post('/tailor', { cvText, jobDescription: jd, language });
      const tailored = { ...res.data, cvText, originalCVText: cvText, originalCV, jobDescription: jd, language };
      setResult(tailored);

      // Save tailored document
      try {
        const jobTitle = res.data.tailoredCV?.experience?.[0]?.title || '';
        const saveRes = await api.post('/document/save', {
          baseCvId: savedCvId,
          jobTitle,
          jobDescription: jd,
          tailoredContent: res.data.tailoredCV,
          coverLetter: res.data.coverLetter,
          gapAnalysis: res.data.gapAnalysis,
          language
        });
        setSavedDocId(saveRes.data._id);
      } catch {
        // Non-critical
      }

      setStep('result');
      toast.success('CV Tailored', 'Your CV and cover letter are ready to preview.');
      analytics.track('tailor_completed', { language, hasJob: Boolean(jd) });

      setDraft(null);
      api.delete('/drafts').catch(() => {});
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to tailor CV. Please try again.');
      toast.error('Tailoring Failed', err.response?.data?.error || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (template = 'modern', format = 'docx') => {
    if (!result) {
      toast.error('No Result', 'No tailored CV available. Please tailor a CV first.');
      return;
    }
    try {
      const res = await api.post('/document/generate', {
        tailoredCV: result.tailoredCV,
        coverLetter: result.coverLetter,
        language: result.language,
        template,
        format,
        documentId: savedDocId
      }, { responseType: 'blob' });

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', result.language === 'fr' ? `CV_Adapte.${format}` : `Tailored_CV.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      fetchUser();
      analytics.track('document_download', { template, format });
      if (res.headers?.['x-watermarked'] === 'true') {
        toast.info(tCommon('watermark_toast_title'), tCommon('watermark_toast_msg'), {
          label: tCommon('upgrade_to_pro'),
          onClick: () => navigate('/pricing')
        });
      } else {
        toast.success('Downloaded', 'Your tailored CV has been saved.');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate document.');
      toast.error('Download Failed', err.response?.data?.error || 'Please try again.');
    }
  };

  const handleCoverLetterSelect = (letter) => {
    setResult((prev) => (prev ? { ...prev, coverLetter: letter } : prev));
  };

  const handleReset = () => {    setStep('choose');
    setFlowKey((k) => k + 1);
    setCvText('');
    setOriginalCV(null);
    setSavedCvId(null);
    setSavedDocId(null);
    setJobDescription('');
    setResult(null);
    setError('');
    // `flowKey` remounts every step, which is what clears the questionnaire:
    // `BuildStep`'s "already edited" guard would otherwise refuse to re-seed it.
    setBuildState(null);
    setBuildTouched(false);
    setBuildSeed(null);
    pendingDraftRef.current = null;
    setDraft(null);
    api.delete('/drafts').catch(() => {});
    navigate('/tailor');
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-10">
      {/* Draft to reopen */}
      {draft && (
        <div className="card border-brand-200 bg-brand-50/40 p-5 sm:p-6 mb-6 animate-scale-in">
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-9 h-9 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </span>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-surface-900 dark:text-white">{t('draft_found_title')}</h2>
              <p className="text-sm text-surface-600 dark:text-surface-300 mt-0.5">
                {describeDraft(draft, language)}
                {draft.updatedAt && (
                  <span className="text-surface-400 dark:text-surface-500"> · {t('draft_saved_at', { date: new Date(draft.updatedAt).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) })}</span>
                )}
              </p>
              <div className="flex flex-wrap gap-2 mt-4">
                <button onClick={handleResumeDraft} className="btn-primary">
                  {t('draft_resume')}
                </button>
                <button onClick={handleDiscardDraft} disabled={discarding} className="btn-secondary">
                  {discarding ? tCommon('loading') : t('draft_discard')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* A draft the user may have relied on, which could not be loaded or saved */}
      {draftLoadFailed && !draft && (
        <div className="flex items-center gap-2 bg-amber-50 text-amber-800 text-sm p-3.5 rounded-xl border border-amber-100 mb-6">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span className="flex-1">{t('draft_unavailable')}</span>
          <button onClick={() => setDraftLoadFailed(false)} className="text-amber-500 hover:text-amber-700 cursor-pointer" aria-label={tCommon('dismiss')}>&times;</button>
        </div>
      )}

      {/* Progress indicator */}
      {step !== 'choose' && step !== 'result' && (
        <div className="mb-10">
          <div className="flex items-center gap-4">
            {steps.map((stepItem, i) => (
              <div key={stepItem.label} className="flex items-center gap-4 flex-1 last:flex-none">
                <div className={`flex items-center gap-2 text-sm font-medium whitespace-nowrap ${
                  i <= currentStage ? 'text-surface-900 dark:text-white' : 'text-surface-400 dark:text-surface-500'
                }`}>
                  <span className={`font-mono text-xs font-bold ${i <= currentStage ? 'text-brand-600 dark:text-brand-400' : 'text-surface-300 dark:text-surface-600'}`}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="hidden sm:inline">{stepItem.label}</span>
                </div>
                {i < 2 && (
                  <div className={`flex-1 h-px transition-colors duration-300 ${i < currentStage ? 'bg-brand-400' : 'bg-surface-200 dark:bg-surface-700'}`} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-rose-50 text-rose-700 text-sm p-3.5 rounded-xl border border-rose-100 mb-6 animate-scale-in">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="text-rose-400 hover:text-rose-600 cursor-pointer">&times;</button>
        </div>
      )}

      <div key={flowKey}>
        <div className={step === 'choose' ? '' : 'hidden'} aria-hidden={step !== 'choose'}>
          <PathChoice onSelect={handlePathChoice} />
        </div>
        <div className={step === 'upload' ? '' : 'hidden'} aria-hidden={step !== 'upload'}>
          <UploadStep onComplete={handleCvReady} onBack={() => { setSourcePath('upload'); setStep('choose'); }} />
        </div>
        <div className={step === 'build' ? '' : 'hidden'} aria-hidden={step !== 'build'}>
          <BuildStep
            onComplete={handleCvReady}
            onBack={() => { setSourcePath('build'); setStep('choose'); }}
            language={language}
            user={user}
            restoredState={buildSeed}
            onStateChange={handleBuildStateChange}
            draftReady={draftLoaded}
          />
        </div>
        <div className={step === 'job' ? '' : 'hidden'} aria-hidden={step !== 'job'}>
          <JobDescriptionStep
            jobDescription={jobDescription}
            setJobDescription={setJobDescription}
            language={language}
            setLanguage={setLanguage}
            cvText={cvText}
            onSubmit={() => handleTailor(false)}
            onSkip={() => handleTailor(true)}
            onBack={() => setStep(sourcePath === 'upload' ? 'upload' : 'build')}
            loading={loading}
          />
        </div>
        <div className={step === 'result' && result ? '' : 'hidden'} aria-hidden={step !== 'result'}>
          {result && <ResultStep result={result} onDownload={handleDownload} onReset={handleReset} loading={loading} documentId={savedDocId} onCoverLetterSelect={handleCoverLetterSelect} />}
        </div>
      </div>
    </div>
  );
}
