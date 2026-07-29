import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { useCache, invalidateCacheKey } from '../hooks/useCache';
import { useToast } from '../contexts/ToastContext';

export default function MyCVsPage() {
  const { t } = useTranslation('common');
  const { t: tTailor } = useTranslation('tailor');
  const navigate = useNavigate();
  const { toast } = useToast();
  const prevFocusRef = useRef(null);
  const modalRef = useRef(null);

  const { data: cvsData, mutate: setCvs, isLoading } = useCache('/cv/list', { staleTime: 15_000 });
  const cvs = cvsData || [];
  const [deletingId, setDeletingId] = useState(null);
  const [viewingCV, setViewingCV] = useState(null);

  useEffect(() => {
    if (viewingCV) {
      prevFocusRef.current = document.activeElement;
      requestAnimationFrame(() => {
        const firstFocusable = modalRef.current?.querySelector('button, input, [tabindex]:not([tabindex="-1"])');
        firstFocusable?.focus();
      });
    }
    return () => {
      if (!viewingCV) return;
      prevFocusRef.current?.focus();
    };
  }, [viewingCV]);

  useEffect(() => {
    if (!viewingCV) return;
    const handleEscape = (e) => {
      if (e.key === 'Escape') setViewingCV(null);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [viewingCV]);

  const handleDelete = async (cvId) => {
    if (!confirm('Delete this saved CV?')) return;
    setDeletingId(cvId);
    try {
      await api.delete(`/cv/${cvId}`);
      setCvs(prev => prev.filter(c => c._id !== cvId));
      invalidateCacheKey('/cv/list');
      toast.info('Deleted', 'CV has been removed.');
    } catch {
      toast.error('Error', 'Failed to delete CV.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleView = async (cvId) => {
    try {
      const res = await api.get(`/cv/${cvId}`);
      setViewingCV(res.data);
    } catch {
      toast.error('Error', 'Failed to load CV details.');
    }
  };

  const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  const sourceLabels = {
    upload: { en: 'Uploaded', fr: 'Téléversé' },
    build: { en: 'Built from scratch', fr: 'Créé de zéro' },
    paste: { en: 'Pasted text', fr: 'Texte collé' }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12 animate-slide-up" role="main">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">{tTailor('my_cvs')}</h1>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">{tTailor('my_cvs_desc')}</p>
        </div>
        <Link to="/tailor" className="btn-primary text-sm no-underline flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          {tTailor('new_cv')}
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="card p-5"><div className="animate-shimmer h-4 w-48 rounded mb-2" /><div className="animate-shimmer h-3 w-32 rounded" /></div>
          ))}
        </div>
      ) : cvs.length === 0 ? (
        <div className="card p-12 text-center animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center mx-auto mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-brand-400">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/>
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-surface-900 dark:text-white mb-2">{tTailor('no_saved_cvs')}</h3>
          <p className="text-sm text-surface-500 dark:text-surface-400 mb-6 max-w-sm mx-auto">
            {tTailor('no_saved_cvs_desc')}
          </p>
          <div className="flex justify-center gap-3">
            <Link to="/tailor" className="btn-primary no-underline text-sm">{tTailor('upload_cv')}</Link>
            <Link to="/tailor?path=build" className="btn-secondary no-underline text-sm">{tTailor('build_cv')}</Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {cvs.map((cv, i) => (
            <div
              key={cv._id}
              className="card p-5 hover:border-surface-300 dark:hover:border-surface-600 transition-all animate-slide-up group"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 dark:from-brand-900/30 dark:to-brand-800/30 flex items-center justify-center flex-shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-500">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-surface-900 dark:text-white truncate">{cv.label || 'My CV'}</p>
                  <p className="text-xs text-surface-400 dark:text-surface-500">
                    {formatDate(cv.createdAt)} &middot; {sourceLabels[cv.source]?.[i18n.language?.startsWith('fr') ? 'fr' : 'en'] || cv.source}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleView(cv._id)}
                    className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-500 hover:text-brand-600 transition-colors cursor-pointer"
                    title="View"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(cv._id)}
                    disabled={deletingId === cv._id}
                    className="p-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 text-surface-400 hover:text-rose-500 transition-colors cursor-pointer"
                    title="Delete"
                  >
                    {deletingId === cv._id ? (
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CV Detail Modal */}
      {viewingCV && (
        <div className="fixed inset-0 z-50 bg-surface-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={() => setViewingCV(null)}>
          <div ref={modalRef} className="bg-surface-0 dark:bg-surface-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6 animate-scale-in" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="CV details">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-surface-900 dark:text-white">{viewingCV.label || 'My CV'}</h3>
              <button onClick={() => setViewingCV(null)} className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-400 cursor-pointer transition-colors">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="whitespace-pre-wrap text-sm text-surface-600 dark:text-surface-300 leading-relaxed bg-surface-50 dark:bg-surface-900 rounded-xl p-4 font-mono text-xs max-h-[60vh] overflow-y-auto">
              {viewingCV.originalText || 'No content available.'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
