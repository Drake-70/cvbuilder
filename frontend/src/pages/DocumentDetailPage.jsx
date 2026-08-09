import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import api from '../services/api';
import analytics from '../utils/analytics';
import PaymentModal from '../components/PaymentModal';
import CVPreview from '../components/CVPreview';
import EditableCVForm from '../components/EditableCVForm';

export default function DocumentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  const { t: tTailor } = useTranslation('tailor');
  const { t: tPayment } = useTranslation('payment');
  const { user, fetchUser } = useAuth();
  const { toast } = useToast();
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [format] = useState('docx');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');
  const [templateOverride, setTemplateOverride] = useState(null);

  const isSubscribed = user?.subscriptionStatus === 'active';

  useEffect(() => {
    const fetchDoc = async () => {
      try {
        const res = await api.get(`/document/${id}`);
        setDoc(res.data);
      } catch (err) {
        setError(err.response?.status === 404 ? t('doc_not_found') : t('doc_load_failed'));
      } finally {
        setLoading(false);
      }
    };
    fetchDoc();
  }, [id, t]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentId = params.get('payment');
    const marker = localStorage.getItem('cvboost_pending_payment');
    if (!paymentId || marker !== paymentId) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await api.get(`/payments/status/${paymentId}`);
        if (res.data.status === 'success') {
          localStorage.removeItem('cvboost_pending_payment');
          if (!cancelled) {
            toast.success(tPayment('success_toast'), tPayment('success_toast_msg'));
            fetchUser();
            try {
              const fresh = await api.get(`/document/${id}`);
              setDoc(fresh.data);
            } catch { /* doc refetch is best-effort */ }
            handleDownload();
          }
        } else if (res.data.status === 'failed' || res.data.status === 'expired') {
          localStorage.removeItem('cvboost_pending_payment');
          if (!cancelled) toast.error(tPayment('failed_toast'), tPayment('failed_toast_msg'));
        } else {
          setTimeout(poll, 2000);
        }
      } catch {
        setTimeout(poll, 2000);
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [id, tPayment, toast, fetchUser, handleDownload]);

  const handleDownload = useCallback(async (fmt = format) => {
    setDownloading(true);
    try {
      const res = await api.get(`/document/${id}/download?format=${fmt}`, { responseType: 'blob' });
      const filename = doc?.language === 'fr' ? `CV_Adapte.${fmt}` : `Tailored_CV.${fmt}`;
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      fetchUser();
      analytics.track('document_download', { format: fmt, documentId: id });
      if (res.headers?.['x-watermarked'] === 'true') {
        toast.info(t('watermark_toast_title'), t('watermark_toast_msg'));
      }
    } catch {
      toast.error(t('download_failed'), t('download_failed_msg'));
    } finally {
      setDownloading(false);
    }
  }, [id, format, doc, t, toast, fetchUser]);

  const handlePaymentSuccess = () => {
    handleDownload();
  };

  const handleSaveEdit = async (cv) => {
    setSavingEdit(true);
    setEditError('');
    try {
      const res = await api.patch(`/document/${id}`, { tailoredContent: cv });
      setDoc(res.data);
      setEditing(false);
      toast.success(t('editor.saved_success'), t('editor.saved_success'));
      analytics.track('document_edited', { documentId: id });
    } catch (err) {
      setEditError(err.response?.data?.error || t('editor.save_failed'));
    } finally {
      setSavingEdit(false);
    }
  };

  const shareWhatsApp = async () => {
    let link = shareUrl;
    if (!link) {
      try {
        const res = await api.post(`/document/${id}/share`);
        link = res.data.shareUrl;
        setShareUrl(link);
      } catch { /* fall through to app link */ }
    }
    const target = link ? window.location.origin + link : window.location.origin + '/tailor';
    const msg = t('whatsapp_share_msg', { title: doc?.jobTitle || t('my_tailored_cv'), link: target });
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
  };

  useEffect(() => {
    if (!shareUrl) return;
    const fetchStats = async () => {
      setStatsLoading(true);
      try {
        const res = await api.get(`/document/${id}/share-stats`);
        setStats(res.data);
      } catch { /* silent */ } finally {
        setStatsLoading(false);
      }
    };
    fetchStats();
  }, [shareUrl, id]);

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
      analytics.track('share_link_created', { documentId: id });
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
  const template = templateOverride || doc?.template || 'modern';

  const handleTemplateChange = async (tpl) => {
    setTemplateOverride(tpl);
    try {
      const res = await api.patch(`/document/${id}`, { template: tpl });
      setDoc(res.data);
    } catch {
      // keep the override locally; persistence is best-effort
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12 animate-slide-up" role="main">
      {/* Header */}
      <div className="mb-8">
        <button onClick={() => navigate(-1)} className="btn-ghost text-sm mb-3 -ml-2">
          <svg className="w-4 h-4 mr-1 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12,19 5,12 12,5"/>
          </svg>
          {t('back')}
        </button>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="kicker mb-2">{t('tailored_document')}</p>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-surface-900 dark:text-white truncate">
              {doc.jobTitle || tTailor('tailored_cv')}
            </h1>
            <p className="text-sm text-surface-500 dark:text-surface-400 mt-2">
              {formatDate(doc.createdAt)} &middot; {doc.language === 'fr' ? 'Fran\u00e7ais' : 'English'}
            </p>
            {(doc.downloadCount > 0 || doc.viewCount > 0) && (
              <div className="flex items-center gap-2 mt-4">
                {doc.downloadCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 text-xs font-medium text-surface-500 dark:text-surface-400">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    {t('count_downloads', { count: doc.downloadCount })}
                  </span>
                )}
                {doc.viewCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 text-xs font-medium text-surface-500 dark:text-surface-400">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    {t('count_views', { count: doc.viewCount })}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => { setEditError(''); setEditing((v) => !v); }} className="btn-ghost text-sm flex items-center gap-1.5" title={t('editor.edit_cv')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
              {editing ? t('editor.done_editing') : t('editor.edit')}
            </button>
            <button onClick={handleShare} disabled={sharing} className="btn-ghost text-sm flex items-center gap-1.5" title={t('copy_share_link')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
              {copied ? t('copied') : t('share')}
            </button>
            <button onClick={shareWhatsApp} className="btn-ghost text-sm flex items-center gap-1.5 text-emerald-600 hover:text-emerald-700" title={t('share_whatsapp')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              {t('whatsapp')}
            </button>
            <button onClick={() => handleDownload('pdf')} disabled={downloading} className="btn-ghost text-sm flex items-center gap-1.5" title={t('download_pdf')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              PDF
            </button>
            <button onClick={() => handleDownload('docx')} disabled={downloading} className="btn-primary flex items-center gap-2">
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
              {(isSubscribed || (user?.freeDocumentCredits || 0) > 0) ? t('download') : t('download')}
            </button>
          </div>
        </div>
      </div>

      {/* Upsell: watermarked download for unpaid users */}
      {!isSubscribed && !((user?.freeDocumentCredits || 0) > 0) && !doc?.paid && (
        <div className="card p-4 mb-6 flex flex-col sm:flex-row sm:items-center gap-3 border-amber-200 dark:border-amber-800/40 bg-amber-50/60 dark:bg-amber-900/10">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-surface-800 dark:text-surface-100 flex items-center gap-2">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500 flex-shrink-0">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              {t('watermark_label')}
            </p>
            <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">{t('watermark_banner_desc')}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => setPaymentOpen(true)} className="btn-primary text-sm whitespace-nowrap">
              {t('pay_clean_version')}
            </button>
            <Link to="/pricing" className="btn-ghost text-sm whitespace-nowrap">
              {t('upgrade_to_pro')}
            </Link>
          </div>
        </div>
      )}

      {/* Job Description */}
      {doc.jobDescription && (
        <div className="card p-4 mb-6">
          <h3 className="text-xs font-bold text-surface-400 uppercase tracking-wider mb-2">{t('job_description')}</h3>
          <p className="text-sm text-surface-600 dark:text-surface-300 leading-relaxed whitespace-pre-wrap line-clamp-4">
            {doc.jobDescription}
          </p>
        </div>
      )}

      {/* CV Preview */}
      <div className="mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-surface-400">{t('template')}:</span>
          {['modern', 'classic', 'creative', 'professional', 'minimal', 'bold'].map((tpl) => (
            <button
              key={tpl}
              onClick={() => handleTemplateChange(tpl)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all border ${
                template === tpl
                  ? 'bg-brand-50 border-brand-300 text-brand-700'
                  : 'bg-surface-50 border-surface-200 text-surface-500 hover:border-surface-300'
              }`}
            >
              {tpl.charAt(0).toUpperCase() + tpl.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="card p-5 sm:p-6 mb-6">
        {editing ? (
          <EditableCVForm
            cv={cv}
            language={doc.language}
            onSave={handleSaveEdit}
            onCancel={() => setEditing(false)}
            saving={savingEdit}
            error={editError}
          />
        ) : (
          <CVPreview
            cv={cv}
            language={doc.language}
            template={template}
            watermarked={!isSubscribed && !(user?.freeDocumentCredits || 0) > 0 && !doc?.paid}
            watermarkLabel={t('watermark_label')}
            watermarkHint={t('watermark_hint')}
          />
        )}
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

      {/* Share Insights */}
      {shareUrl && (
        <div className="card p-5 sm:p-6 mb-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-xs font-bold text-brand-600 uppercase tracking-wider">{t('share_insights')}</h3>
            {statsLoading && <span className="text-xs text-surface-400 animate-pulse">{t('loading')}</span>}
          </div>
          <p className="text-xs text-surface-400 mb-4">{t('share_insights_desc')}</p>

          {stats && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="rounded-xl border border-surface-200 p-3">
                    <p className="text-2xl font-extrabold text-surface-900">{stats.viewCount}</p>
                    <p className="text-xs text-surface-400">{t('total_views')}</p>
                  </div>
                  <div className="rounded-xl border border-surface-200 p-3">
                    <p className="text-2xl font-extrabold text-surface-900">{stats.downloadCount}</p>
                    <p className="text-xs text-surface-400">{t('download_count')}</p>
                  </div>
                </div>
                {stats.perDay.length > 0 ? (
                  <div className="flex items-end gap-1 h-24">
                    {stats.perDay.map((d) => (
                      <div key={d.date} className="flex-1 flex flex-col items-center gap-1" title={`${d.date}: ${t('count_views', { count: d.count })}`}>
                        <div className="w-full bg-brand-100 rounded-t" style={{ height: `${Math.max(4, (d.count / Math.max(...stats.perDay.map((x) => x.count))) * 100)}%` }} />
                        <span className="text-[9px] text-surface-400">{d.date.slice(8)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-surface-400">{t('no_views_30d')}</p>
                )}
              </div>

              <div>
                {stats.referers.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-surface-500 mb-2">{t('top_referrers')}</p>
                    <div className="space-y-1.5">
                      {stats.referers.map((r, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="text-surface-600 truncate">{r.referer}</span>
                          <span className="text-surface-400 text-xs font-medium">{r.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {stats.recentViews.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-surface-500 mb-2">{t('recent_views')}</p>
                    <div className="space-y-1.5">
                      {stats.recentViews.map((v, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="text-surface-600 truncate max-w-[60%]">{v.userAgent || t('unknown_device')}</span>
                          <span className="text-surface-400 text-xs">{new Date(v.createdAt).toLocaleDateString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
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
