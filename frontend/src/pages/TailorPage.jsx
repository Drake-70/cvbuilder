import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import PathChoice from '../components/PathChoice';
import UploadStep from '../components/UploadStep';
import BuildStep from '../components/BuildStep';
import JobDescriptionStep from '../components/JobDescriptionStep';
import ResultStep from '../components/ResultStep';

export default function TailorPage() {
  const { i18n, t } = useTranslation('tailor');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, fetchUser } = useAuth();
  const { toast } = useToast();
  const initialPath = searchParams.get('path') || null;
  const retTailorId = searchParams.get('retailor') || null;

  const [step, setStep] = useState(initialPath ? (initialPath === 'build' ? 'build' : 'upload') : 'choose');
  const [sourcePath, setSourcePath] = useState(initialPath === 'build' ? 'build' : 'upload');
  const [cvText, setCvText] = useState('');
  const [savedCvId, setSavedCvId] = useState(null);
  const [savedDocId, setSavedDocId] = useState(null);
  const [jobDescription, setJobDescription] = useState('');
  const [language, setLanguage] = useState(i18n.language?.startsWith('fr') ? 'fr' : 'en');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [flowKey, setFlowKey] = useState(0);

  const stepStage = { build: 0, upload: 0, job: 1, result: 2 };
  const currentStage = stepStage[step] ?? -1;
  const steps = [
    { label: t('step_cv') },
    { label: t('step_job') },
    { label: t('step_result') }
  ];

  // Restore a saved draft when starting a fresh visit
  useEffect(() => {
    if (!user || initialPath || retTailorId) return;
    let cancelled = false;
    api.get('/drafts')
      .then((res) => {
        if (cancelled || !res.data?.exists) return;
        const d = res.data;
        if (d.step) setStep(d.step);
        if (d.sourcePath) setSourcePath(d.sourcePath);
        if (d.cvText) setCvText(d.cvText);
        if (d.savedCvId) setSavedCvId(d.savedCvId);
        if (d.savedDocId) setSavedDocId(d.savedDocId);
        if (d.jobDescription) setJobDescription(d.jobDescription);
        if (d.language) setLanguage(d.language);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user, initialPath, retTailorId]);

  // Autosave draft (debounced) while the user is mid-wizard
  useEffect(() => {
    if (!user || result) return;
    if (step === 'choose' && !cvText && !jobDescription) return;
    const timer = setTimeout(() => {
      api.put('/drafts', {
        step,
        sourcePath,
        cvText,
        savedCvId,
        savedDocId,
        jobDescription,
        language
      }).catch(() => {});
    }, 1200);
    return () => clearTimeout(timer);
  }, [user, step, sourcePath, cvText, savedCvId, savedDocId, jobDescription, language, result]);

  const handlePathChoice = (path) => {
    setStep(path);
    setSourcePath(path);
    setError('');
  };

  const handleCvReady = useCallback(async (text, source, parsedSections) => {
    setCvText(text);
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
      const tailored = { ...res.data, cvText, jobDescription: jd, language };
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
      toast.success('Downloaded', 'Your tailored CV has been saved.');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate document.');
      toast.error('Download Failed', err.response?.data?.error || 'Please try again.');
    }
  };

  const handleReset = () => {
    setStep('choose');
    setFlowKey((k) => k + 1);
    setCvText('');
    setSavedCvId(null);
    setSavedDocId(null);
    setJobDescription('');
    setResult(null);
    setError('');
    api.delete('/drafts').catch(() => {});
    navigate('/tailor');
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-10">
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
          <BuildStep onComplete={handleCvReady} onBack={() => { setSourcePath('build'); setStep('choose'); }} language={language} user={user} />
        </div>
        <div className={step === 'job' ? '' : 'hidden'} aria-hidden={step !== 'job'}>
          <JobDescriptionStep
            jobDescription={jobDescription}
            setJobDescription={setJobDescription}
            language={language}
            setLanguage={setLanguage}
            onSubmit={() => handleTailor(false)}
            onSkip={() => handleTailor(true)}
            onBack={() => setStep(sourcePath === 'upload' ? 'upload' : 'build')}
            loading={loading}
          />
        </div>
        <div className={step === 'result' && result ? '' : 'hidden'} aria-hidden={step !== 'result'}>
          {result && <ResultStep result={result} onDownload={handleDownload} onReset={handleReset} loading={loading} documentId={savedDocId} />}
        </div>
      </div>
    </div>
  );
}
