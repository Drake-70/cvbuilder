import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import analytics from '../utils/analytics';
import CVPreview from '../components/CVPreview';

export default function SharedCVPage() {
  const { token } = useParams();
  const { t: tTailor } = useTranslation('tailor');
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchShared = async () => {
      try {
        const res = await api.get(`/document/shared/${token}`);
        setDoc(res.data);
        analytics.track('shared_cv_viewed', { hasCoverLetter: Boolean(res.data.coverLetter) });
      } catch (err) {
        setError(err.response?.status === 404 ? 'This CV link is no longer available.' : 'Failed to load CV.');
      } finally {
        setLoading(false);
      }
    };
    fetchShared();
  }, [token]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        <div className="space-y-4">
          <div className="animate-shimmer h-8 w-64 rounded" />
          <div className="card p-6"><div className="animate-shimmer h-64 w-full rounded-xl" /></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12 text-center animate-slide-up">
        <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center mx-auto mb-4">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-rose-500">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        </div>
        <h2 className="text-xl font-bold text-surface-900 dark:text-white mb-2">{error}</h2>
        <a href="/" className="btn-primary mt-4 inline-block no-underline">Go to CVBoost</a>
      </div>
    );
  }

  const cv = doc?.tailoredContent || {};
  const coverLetter = doc?.coverLetter || '';

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12 animate-slide-up" role="main">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-surface-900 dark:text-white">{doc.jobTitle || tTailor('tailored_cv')}</h1>
        <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
          Shared CV &middot; {doc.language === 'fr' ? 'Fran\u00e7ais' : 'English'}
        </p>
        <p className="text-xs text-surface-400 mt-1">Powered by CVBoost</p>
      </div>

      <div className="card p-5 sm:p-6 mb-6">
        <CVPreview cv={cv} language={doc.language} />
      </div>

      {coverLetter && (
        <div className="card p-5 sm:p-6 mb-6">
          <h3 className="text-xs font-bold text-brand-600 uppercase tracking-wider mb-3">{tTailor('cover_letter')}</h3>
          <div className="whitespace-pre-wrap text-sm text-surface-600 dark:text-surface-300 leading-relaxed">
            {coverLetter}
          </div>
        </div>
      )}
    </div>
  );
}
