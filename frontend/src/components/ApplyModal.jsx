import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useCache, invalidateCacheKey } from '../hooks/useCache';
import api from '../services/api';

const METHODS = [
  {
    key: 'tailor',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a4 4 0 0 0-4 4v4a4 4 0 0 0 8 0V6a4 4 0 0 0-4-4z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/>
      </svg>
    )
  },
  {
    key: 'email',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22,6 12,13 2,6"/>
      </svg>
    )
  },
  {
    key: 'link',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15,3 21,3 21,9"/><line x1="10" y1="14" x2="21" y2="3"/>
      </svg>
    )
  }
];

export default function ApplyModal({ job, applied, onClose, onApplied }) {
  const { t } = useTranslation('jobs');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const { toast } = useToast();
  const modalRef = useRef(null);

  const [method, setMethod] = useState(null);
  const [cvId, setCvId] = useState('');
  const [cvText, setCvText] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const { data: cvsData } = useCache('/cv/list', { enabled: !!user });
  const cvs = cvsData || [];

  useEffect(() => {
    const prev = document.activeElement;
    requestAnimationFrame(() => {
      modalRef.current?.querySelector('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')?.focus();
    });
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
      prev?.focus();
    };
  }, [onClose]);

  const handleSubmit = async () => {
    if (!method || submitting) return;

    if (method === 'tailor' && !cvId && !cvText.trim()) {
      toast.error(tc('error'), t('cv_text_placeholder'));
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/jobs/apply', {
        jobId: job._id,
        method,
        cvId: cvId || undefined,
        cvText: method === 'tailor' ? cvText.trim() || undefined : undefined,
        notes: notes.trim() || undefined
      });
      onApplied(job._id);
      invalidateCacheKey('/jobs/applications');

      if (method === 'email') {
        const contact = res.data.contactEmail || job.contactEmail || '';
        const subject = encodeURIComponent(`Application: ${job.title}${job.company ? ` - ${job.company}` : ''}`);
        const body = encodeURIComponent(`Hello${job.company ? ` ${job.company}` : ''},\n\nI am applying for the position of ${job.title}. Please find my CV attached.\n\nBest regards,\n${user?.name || ''}\n${user?.email || ''}`);
        window.open(`mailto:${contact}?subject=${subject}&body=${body}`, '_self');
        toast.success(t('application_sent'), t('application_sent_desc'));
        onClose();
        return;
      }

      if (method === 'link') {
        const url = res.data.applyUrl || job.applyUrl || job.sourceUrl;
        window.open(url, '_blank', 'noopener,noreferrer');
        toast.success(t('application_sent'), t('application_sent_desc'));
        onClose();
        return;
      }

      setResult({ tailoredDocumentId: res.data.tailoredDocumentId, coverLetter: res.data.coverLetter });
    } catch (err) {
      toast.error(tc('error'), err.response?.data?.error || tc('server_error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-surface-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="bg-surface-0 dark:bg-surface-800 rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('apply')}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-surface-900 dark:text-white leading-snug">{job.title}</h3>
            <p className="text-sm text-surface-500 dark:text-surface-400 mt-0.5">
              {job.company}{job.company && job.location ? ' · ' : ''}{job.location}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-400 cursor-pointer transition-colors flex-shrink-0" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {applied && (
          <div className="mb-4 flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-xl px-4 py-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/>
            </svg>
            {t('already_applied')}
          </div>
        )}

        {result ? (
          <div className="text-center py-6 animate-fade-in">
            <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mx-auto mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600 dark:text-emerald-400">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/>
              </svg>
            </div>
            <h4 className="text-lg font-bold text-surface-900 dark:text-white mb-1">{t('application_sent')}</h4>
            <p className="text-sm text-surface-500 dark:text-surface-400 mb-6">{t('application_sent_desc')}</p>
            <div className="flex flex-col gap-2.5">
              {result.tailoredDocumentId && (
                <Link to={`/documents/${result.tailoredDocumentId}`} onClick={onClose} className="btn-primary no-underline text-sm justify-center">
                  {tc('my_cvs')}
                </Link>
              )}
              <button onClick={onClose} className="btn-secondary text-sm cursor-pointer">{tc('back')}</button>
            </div>
          </div>
        ) : (
          <>
            {!method ? (
              <div>
                <p className="text-sm font-medium text-surface-700 dark:text-surface-300 mb-3">{t('apply_method')}</p>
                <div className="space-y-2.5">
                  {METHODS.map((m) => (
                    <button
                      key={m.key}
                      onClick={() => setMethod(m.key)}
                      className="w-full flex items-center gap-3.5 text-left p-4 rounded-xl border border-surface-200 dark:border-surface-700 hover:border-brand-300 dark:hover:border-brand-600 hover:bg-brand-50/40 dark:hover:bg-brand-900/20 transition-all cursor-pointer"
                    >
                      <span className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/40 text-brand-600 dark:text-brand-300 flex items-center justify-center flex-shrink-0">
                        {m.icon}
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-surface-900 dark:text-white">{t(`method_${m.key}`)}</span>
                        <span className="block text-xs text-surface-500 dark:text-surface-400 mt-0.5">{t(`method_${m.key}_desc`)}</span>
                      </span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto text-surface-300 dark:text-surface-600 flex-shrink-0">
                        <polyline points="9,18 15,12 9,6"/>
                      </svg>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="animate-fade-in">
                <button
                  onClick={() => setMethod(null)}
                  className="inline-flex items-center gap-1.5 text-xs text-surface-500 dark:text-surface-400 hover:text-brand-600 dark:hover:text-brand-400 mb-4 cursor-pointer"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15,18 9,12 15,6"/>
                  </svg>
                  {t('back_to_jobs')}
                </button>

                {method === 'tailor' && (
                  <div className="space-y-4">
                    {cvs.length > 0 && (
                      <div>
                        <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">{t('select_cv')}</label>
                        <select
                          value={cvId}
                          onChange={(e) => setCvId(e.target.value)}
                          className="w-full rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 px-3.5 py-2.5 text-sm text-surface-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                        >
                          <option value="">{t('cv_placeholder')}</option>
                          {cvs.map((cv) => (
                            <option key={cv._id} value={cv._id}>{cv.label || tc('my_cvs')}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div>
                      {cvs.length > 0 && <p className="text-xs text-surface-400 mb-1.5">{t('or_paste')}</p>}
                      <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">{t('cv_text_placeholder')}</label>
                      <textarea
                        value={cvText}
                        onChange={(e) => setCvText(e.target.value)}
                        rows={6}
                        className="w-full rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 px-3.5 py-2.5 text-sm text-surface-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/40 resize-y"
                      />
                    </div>
                    {!job.description && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        {t('no_description_warning')}
                      </p>
                    )}
                  </div>
                )}

                {method === 'email' && (
                  <div className="text-sm text-surface-500 dark:text-surface-400 space-y-3">
                    <p>{t('method_email_desc')}</p>
                    {job.contactEmail && (
                      <p className="font-medium text-surface-700 dark:text-surface-300">{job.contactEmail}</p>
                    )}
                  </div>
                )}

                {method === 'link' && (
                  <div className="text-sm text-surface-500 dark:text-surface-400 space-y-3">
                    <p>{t('method_link_desc')}</p>
                  </div>
                )}

                {method === 'tailor' && (
                  <div className="mt-5 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">{t('notes')}</label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={2}
                        className="w-full rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 px-3.5 py-2.5 text-sm text-surface-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/40 resize-y"
                      />
                    </div>
                    <button
                      onClick={handleSubmit}
                      disabled={submitting}
                      className="btn-primary w-full text-sm justify-center cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {submitting ? (
                        <span className="inline-flex items-center gap-2">
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                          </svg>
                          {t('tailoring')}
                        </span>
                      ) : (
                        t('send_application')
                      )}
                    </button>
                  </div>
                )}

                {method !== 'tailor' && (
                  <div className="mt-4">
                    <button
                      onClick={handleSubmit}
                      disabled={submitting}
                      className="btn-secondary w-full text-sm justify-center cursor-pointer disabled:opacity-60"
                    >
                      {submitting ? tc('loading') : t('send_application')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
