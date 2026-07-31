import { useState, useCallback } from 'react';
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
  const { i18n } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const initialPath = searchParams.get('path') || null;
  const retTailorId = searchParams.get('retailor') || null;

  const [step, setStep] = useState(initialPath ? (initialPath === 'build' ? 'build' : 'upload') : 'choose');
  const [cvText, setCvText] = useState('');
  const [savedCvId, setSavedCvId] = useState(null);
  const [savedDocId, setSavedDocId] = useState(null);
  const [jobDescription, setJobDescription] = useState('');
  const [language, setLanguage] = useState(i18n.language?.startsWith('fr') ? 'fr' : 'en');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const stepOrder = ['choose', 'upload', 'job', 'result'];
  const currentStepIndex = stepOrder.indexOf(step);

  const handlePathChoice = (path) => {
    setStep(path);
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
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to tailor CV. Please try again.');
      toast.error('Tailoring Failed', err.response?.data?.error || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (template = 'modern') => {
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
        documentId: savedDocId
      }, { responseType: 'blob' });

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', result.language === 'fr' ? 'CV_Adapte.docx' : 'Tailored_CV.docx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Downloaded', 'Your tailored CV has been saved.');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate document.');
      toast.error('Download Failed', err.response?.data?.error || 'Please try again.');
    }
  };

  const handleReset = () => {
    setStep('choose');
    setCvText('');
    setSavedCvId(null);
    setSavedDocId(null);
    setJobDescription('');
    setResult(null);
    setError('');
    navigate('/tailor');
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-10">
      {/* Progress indicator */}
      {step !== 'choose' && step !== 'result' && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            {['CV', 'Job', 'Result'].map((label, i) => (
              <div key={label} className="flex items-center gap-2">
                <div className={`step-dot w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                  i <= currentStepIndex ? 'bg-brand-600 text-white shadow-sm' : 'bg-surface-100 text-surface-400'
                }`}>
                  {i < currentStepIndex ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20,6 9,17 4,12"/>
                    </svg>
                  ) : i + 1}
                </div>
                <span className={`text-xs font-medium hidden sm:inline ${i <= currentStepIndex ? 'text-surface-700' : 'text-surface-400'}`}>{label}</span>
                {i < 2 && <div className={`step-line w-8 sm:w-12 h-0.5 rounded-full mx-1 transition-colors duration-300 ${i < currentStepIndex ? 'bg-brand-400' : 'bg-surface-200'}`} />}
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

      <div>
        {step === 'choose' && <PathChoice onSelect={handlePathChoice} />}
        {step === 'upload' && <UploadStep onComplete={handleCvReady} onBack={() => setStep('choose')} />}
        {step === 'build' && <BuildStep onComplete={handleCvReady} onBack={() => setStep('choose')} language={language} user={user} />}
        {step === 'job' && (
          <JobDescriptionStep
            jobDescription={jobDescription}
            setJobDescription={setJobDescription}
            language={language}
            setLanguage={setLanguage}
            onSubmit={() => handleTailor(false)}
            onSkip={() => handleTailor(true)}
            onBack={() => setStep('build')}
            loading={loading}
          />
        )}
        {step === 'result' && result && (
          <ResultStep result={result} onDownload={handleDownload} onReset={handleReset} loading={loading} documentId={savedDocId} />
        )}
      </div>
    </div>
  );
}
