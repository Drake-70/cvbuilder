import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import PaymentModal from '../components/PaymentModal';
import CVPreview from '../components/CVPreview';

export default function DocumentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  const { t: tTailor } = useTranslation('tailor');
  const { user } = useAuth();
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  const isSubscribed = user?.subscriptionStatus === 'active';

  useEffect(() => {
    const fetchDoc = async () => {
      try {
        const res = await api.get(`/document/${id}`);
        setDoc(res.data);
      } catch (err) {
        setError(err.response?.status === 404 ? 'Document not found.' : 'Failed to load document.');
      } finally {
        setLoading(false);
      }
    };
    fetchDoc();
  }, [id]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await api.get(`/document/${id}/download`, { responseType: 'blob' });
      const filename = doc?.language === 'fr' ? 'CV_Adapte.docx' : 'Tailored_CV.docx';
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      if (err.response?.status === 402) {
        setPaymentOpen(true);
      }
    } finally {
      setDownloading(false);
    }
  };

  const handlePaymentSuccess = () => {
    handleDownload();
  };

  const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const handleShare = async () => {
    if (shareUrl) {
      navigator.clipboard.writeText(window.location.origin + shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    }
    setSharing(true);
    try {
      const res = await api.post(`/document/${id}/share`);
      const url = res.data.shareUrl;
      setShareUrl(url);
      navigator.clipboard.writeText(window.location.origin + url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* silent */ } finally {
      setSharing(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        <div className="space-y-4">
          <div className="animate-shimmer h-8 w-64 rounded" />
          <div className="animate-shimmer h-4 w-48 rounded" />
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
        <button onClick={() => navigate('/dashboard')} className="btn-primary mt-4">
          {t('dashboard')}
        </button>
      </div>
    );
  }

  const cv = doc?.tailoredContent || {};
  const coverLetter = doc?.coverLetter || '';
  const gaps = doc?.gapAnalysis || [];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12 animate-slide-up" role="main">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <button onClick={() => navigate(-1)} className="btn-ghost text-sm mb-2 -ml-2">
            <svg className="w-4 h-4 mr-1 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12,19 5,12 12,5"/>
            </svg>
            {t('back')}
          </button>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">{doc.jobTitle || tTailor('tailored_cv')}</h1>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
            {formatDate(doc.createdAt)} &middot; {doc.language === 'fr' ? 'Fran\u00e7ais' : 'English'}
          </p>
          {(doc.downloadCount > 0 || doc.viewCount > 0) && (
            <div className="flex items-center gap-3 mt-2 text-xs text-surface-400">
              {doc.downloadCount > 0 && <span>{doc.downloadCount} download{doc.downloadCount !== 1 ? 's' : ''}</span>}
              {doc.viewCount > 0 && <span>{doc.viewCount} view{doc.viewCount !== 1 ? 's' : ''}</span>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleShare} disabled={sharing} className="btn-ghost text-sm flex items-center gap-1.5" title="Copy share link">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            {copied ? 'Copied!' : 'Share'}
          </button>
          <button onClick={handleDownload} disabled={downloading} className="btn-primary flex items-center gap-2">
            {downloading ? (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            )}
            {isSubscribed ? t('download') : `Pay & ${t('download')}`}
          </button>
        </div>
      </div>

      {/* Job Description */}
      {doc.jobDescription && (
        <div className="card p-4 mb-6">
          <h3 className="text-xs font-bold text-surface-400 uppercase tracking-wider mb-2">Job Description</h3>
          <p className="text-sm text-surface-600 dark:text-surface-300 leading-relaxed whitespace-pre-wrap line-clamp-4">
            {doc.jobDescription}
          </p>
        </div>
      )}

      {/* CV Preview */}
      <div className="card p-5 sm:p-6 mb-6">
        <CVPreview cv={cv} language={doc.language} />
      </div>

      {/* Cover Letter */}
      {coverLetter && (
        <div className="card p-5 sm:p-6 mb-6">
          <h3 className="text-xs font-bold text-brand-600 uppercase tracking-wider mb-3">{tTailor('cover_letter')}</h3>
          <div className="whitespace-pre-wrap text-sm text-surface-600 dark:text-surface-300 leading-relaxed">
            {coverLetter}
          </div>
        </div>
      )}

      {/* Gap Analysis */}
      {gaps.length > 0 && (
        <div className="card p-5 sm:p-6 mb-6">
          <h3 className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-3">{tTailor('gap_analysis')}</h3>
          <div className="space-y-2">
            {gaps.map((gap, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-amber-50/80 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/30">
                <div className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                </div>
                <span className="text-sm text-surface-700 dark:text-surface-300">{gap}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <PaymentModal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        onSuccess={handlePaymentSuccess}
        documentId={id}
        type="one-time"
      />
    </div>
  );
}
