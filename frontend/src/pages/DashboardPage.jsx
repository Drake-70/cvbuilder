import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import PaymentModal from '../components/PaymentModal';
import ReferralWidget from '../components/ReferralWidget';
import ApplicationTracker from '../components/ApplicationTracker';
import { useCache, invalidateCacheKey } from '../hooks/useCache';
import { useToast } from '../contexts/ToastContext';
import { DashboardSkeleton } from '../components/Skeleton';

function AnimatedCounter({ value, duration = 800 }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    const target = value || 0;
    if (target === 0) { setDisplay(0); return; }
    const start = performance.now();
    const animate = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * target));
      if (progress < 1) ref.current = requestAnimationFrame(animate);
    };
    ref.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(ref.current);
  }, [value, duration]);

  return <span>{display}</span>;
}

export default function DashboardPage() {
  const { t } = useTranslation('common');
  const { t: tTailor } = useTranslation('tailor');
  const { user, fetchUser } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentDocId, setPaymentDocId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  const { data: documentsData, mutate: setDocuments, refetch: refetchDocs, isLoading: loadingDocs } = useCache('/document/list', { staleTime: 10_000 });
  const documents = documentsData || [];

  const isSubscribed = user?.subscriptionStatus === 'active';

  const handleDownload = async (docId) => {
    setDownloadingId(docId);
    try {
      const res = await api.get(`/document/${docId}/download`, { responseType: 'blob' });
      const doc = documents.find(d => d._id === docId);
      const filename = doc?.jobTitle ? doc.jobTitle.replace(/\s+/g, '_') + '.docx' : 'CV.docx';
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
        setPaymentDocId(docId);
        setPaymentOpen(true);
      }
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (docId) => {
    if (!confirm('Delete this document?')) return;
    try {
      await api.delete(`/document/${docId}`);
      setDocuments(prev => prev.filter(d => d._id !== docId));
      invalidateCacheKey('/document/list');
      toast.info('Deleted', 'Document has been removed.');
    } catch { /* silent */ }
  };

  const handlePaymentSuccess = () => {
    fetchUser();
    invalidateCacheKey('/document/list');
    refetchDocs();
    if (paymentDocId) {
      handleDownload(paymentDocId);
      setPaymentDocId(null);
    }
  };

  const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  const getTimeGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12 animate-slide-up" role="main">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link to="/settings" className="flex items-center gap-3 no-underline group" title={t('settings')}>
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-base shadow-sm group-hover:ring-2 group-hover:ring-brand-300 transition-all" aria-hidden="true">
            {user?.name?.charAt(0)?.toUpperCase()}
          </div>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">{getTimeGreeting()}, {user?.name?.split(' ')[0]}</h1>
          <p className="text-sm text-surface-500 dark:text-surface-400">{t('dashboard')}</p>
        </div>
      </div>

      {/* Subscription banner */}
      {isSubscribed && (
        <div className="card bg-gradient-to-r from-emerald-500 to-emerald-600 border-0 p-4 mb-6 flex items-center gap-3 animate-slide-up">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22,4 12,14.01 9,11.01"/>
          </svg>
          <div className="text-white">
            <p className="font-semibold text-sm">Active Subscription</p>
            <p className="text-emerald-100 text-xs">Unlimited downloads included</p>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid sm:grid-cols-3 gap-4 mb-8">
        <Link to="/tailor" className="no-underline group">
          <div className="card p-5 hover:border-brand-300 dark:hover:border-brand-600 cursor-pointer group-hover:shadow-md transition-all animate-slide-up" style={{ animationDelay: '0s' }}>
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-md mb-3 group-hover:scale-105 transition-transform">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/>
              </svg>
            </div>
            <h3 className="font-bold text-surface-900 dark:text-white mb-1">{tTailor('upload_cv')}</h3>
            <p className="text-sm text-surface-500 dark:text-surface-400">Upload an existing CV.</p>
          </div>
        </Link>
        <Link to="/tailor?path=build" className="no-underline group">
          <div className="card p-5 hover:border-brand-300 dark:hover:border-brand-600 cursor-pointer group-hover:shadow-md transition-all animate-slide-up" style={{ animationDelay: '0.05s' }}>
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-md mb-3 group-hover:scale-105 transition-transform">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </div>
            <h3 className="font-bold text-surface-900 dark:text-white mb-1">{tTailor('build_cv')}</h3>
            <p className="text-sm text-surface-500 dark:text-surface-400">Build from scratch.</p>
          </div>
        </Link>
        <Link to="/cvs" className="no-underline group">
          <div className="card p-5 hover:border-brand-300 dark:hover:border-brand-600 cursor-pointer group-hover:shadow-md transition-all animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md mb-3 group-hover:scale-105 transition-transform">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </div>
            <h3 className="font-bold text-surface-900 dark:text-white mb-1">{t('nav.my_cvs')}</h3>
            <p className="text-sm text-surface-500 dark:text-surface-400">Manage saved CVs.</p>
          </div>
        </Link>
      </div>

      {/* Referral Widget */}
      <div className="mb-8 animate-slide-up" style={{ animationDelay: '0.15s' }}>
        <ReferralWidget />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <div className="card p-4 text-center animate-slide-up" style={{ animationDelay: '0.2s' }}>
          <p className="text-2xl font-bold text-brand-600 dark:text-brand-400">
            <AnimatedCounter value={user?.documentsGeneratedCount || 0} />
          </p>
          <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">Generated</p>
        </div>
        <div className="card p-4 text-center animate-slide-up" style={{ animationDelay: '0.25s' }}>
          <p className="text-2xl font-bold text-emerald-500">
            <AnimatedCounter value={documents.length} />
          </p>
          <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">Saved</p>
        </div>
        <div className="card p-4 text-center animate-slide-up" style={{ animationDelay: '0.3s' }}>
          <p className="text-2xl font-bold text-surface-600 dark:text-surface-300">{isSubscribed ? 'Pro' : 'Free'}</p>
          <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">Plan</p>
        </div>
      </div>

      {!isSubscribed && (
        <Link to="/pricing" className="no-underline mb-8 block animate-slide-up" style={{ animationDelay: '0.35s' }}>
          <div className="card bg-gradient-to-r from-brand-50 to-brand-100/50 dark:from-brand-900/20 dark:to-brand-800/10 border-brand-200 dark:border-brand-800/30 p-4 flex items-center gap-3 hover:shadow-md transition-shadow cursor-pointer">
            <div className="w-9 h-9 rounded-lg bg-brand-500 flex items-center justify-center flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13,2 3,14 12,14 11,22 21,10 12,10 13,2"/>
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-brand-800 dark:text-brand-200">Upgrade to Pro</p>
              <p className="text-xs text-brand-600 dark:text-brand-400">Unlimited downloads for 3,000 XAF/month</p>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-400">
              <polyline points="9,18 15,12 9,6"/>
            </svg>
          </div>
        </Link>
      )}

      {/* Document History */}
      <div className="animate-slide-up" style={{ animationDelay: '0.4s' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-surface-900 dark:text-white">Recent Documents</h2>
          {documents.length > 0 && (
            <span className="text-xs text-surface-400 dark:text-surface-500">{documents.length} total</span>
          )}
        </div>

        {loadingDocs ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="card p-4"><div className="animate-shimmer h-4 w-48 rounded mb-2" /><div className="animate-shimmer h-3 w-32 rounded" /></div>
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="card p-10 text-center">
            <div className="w-16 h-16 rounded-2xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center mx-auto mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-brand-400">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/>
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-surface-900 dark:text-white mb-2">No documents yet</h3>
            <p className="text-sm text-surface-500 dark:text-surface-400 mb-6 max-w-sm mx-auto">
              Start by uploading your CV or building one from scratch. Your tailored documents will appear here.
            </p>
            <div className="flex justify-center gap-3">
              <Link to="/tailor" className="btn-primary text-sm no-underline">Create your first CV</Link>
              <Link to="/tailor?path=build" className="btn-secondary text-sm no-underline">Build from scratch</Link>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map((doc, i) => (
              <div key={doc._id} className="card p-4 hover:border-surface-300 dark:hover:border-surface-600 transition-all animate-slide-up group" style={{ animationDelay: `${i * 0.05}s` }}>
                <div className="flex items-center gap-4">
                  <Link to={`/documents/${doc._id}`} className="flex items-center gap-4 flex-1 min-w-0 no-underline">
                    <div className="w-9 h-9 rounded-lg bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center flex-shrink-0 group-hover:bg-brand-100 dark:group-hover:bg-brand-900/30 transition-colors">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-600 dark:text-brand-400">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/>
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-surface-900 dark:text-white truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">{doc.jobTitle || 'Tailored CV'}</p>
                      <p className="text-xs text-surface-400 dark:text-surface-500">{formatDate(doc.createdAt)} &middot; {doc.language === 'fr' ? 'Fran\u00e7ais' : 'English'}</p>
                    </div>
                  </Link>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDownload(doc._id)}
                      disabled={downloadingId === doc._id}
                      className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-500 hover:text-brand-600 transition-colors cursor-pointer"
                      title="Download"
                    >
                      {downloadingId === doc._id ? (
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                      )}
                    </button>
                    <button onClick={() => handleDelete(doc._id)} className="p-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 text-surface-400 hover:text-rose-500 transition-colors cursor-pointer" title="Delete">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      </svg>
                    </button>
                  </div>
                </div>
                {/* Application Tracker */}
                <div className="mt-2.5 ml-13 pl-[52px]">
                  <ApplicationTracker
                    documentId={doc._id}
                    currentStatus={doc.applicationStatus}
                    currentCompany={doc.companyApplied}
                    onUpdate={(updated) => setDocuments(prev => prev.map(d => d._id === doc._id ? { ...d, ...updated } : d))}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <PaymentModal open={paymentOpen} onClose={() => setPaymentOpen(false)} onSuccess={handlePaymentSuccess} documentId={paymentDocId} type="one-time" />
    </div>
  );
}
