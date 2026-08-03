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
  const [downloading, setDownloading] = useState(false);

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

  const handleDownload = async (format) => {
    setDownloading(true);
    try {
      const res = await api.get(`/document/shared/${token}/download?format=${format}`, { responseType: 'blob' });
      const filename = doc?.language === 'fr' ? `CV_Adapte.${format}` : `Tailored_CV.${format}`;
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      analytics.track('shared_cv_downloaded', { format, hasCoverLetter: Boolean(doc?.coverLetter) });
    } catch {
      setError('Failed to download. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-surface-900 dark:text-white">{doc.jobTitle || tTailor('tailored_cv')}</h1>
            <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
              Shared CV &middot; {doc.language === 'fr' ? 'Fran\u00e7ais' : 'English'}
            </p>
            <p className="text-xs text-surface-400 mt-1">Powered by CVBoost</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleDownload('pdf')}
              disabled={downloading}
              className="btn-ghost text-sm flex items-center gap-1.5"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              PDF
            </button>
            <button
              onClick={() => handleDownload('docx')}
              disabled={downloading}
              className="btn-primary text-sm flex items-center gap-1.5"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              {downloading ? tTailor('generating') : 'Download'}
            </button>
          </div>
        </div>
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
