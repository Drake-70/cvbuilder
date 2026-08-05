import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

export default function ConfirmDialog({
  open, title, message, confirmLabel, cancelLabel,
  onConfirm, onCancel, danger = true, loading = false
}) {
  const { t } = useTranslation('common');
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    requestAnimationFrame(() => {
      ref.current?.querySelector('[data-dismiss]')?.focus();
    });
    const onKey = (e) => {
      if (e.key === 'Escape' && !loading) onCancel?.();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (prev && prev !== document.body) prev.focus?.();
    };
  }, [open, loading, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-surface-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={() => !loading && onCancel?.()}
    >
      <div
        ref={ref}
        className="bg-surface-0 dark:bg-surface-800 rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-start gap-3 mb-5">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${danger ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-500' : 'bg-amber-50 dark:bg-amber-900/30 text-amber-500'}`}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-surface-900 dark:text-white leading-snug">{title}</h3>
            {message && <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">{message}</p>}
          </div>
        </div>
        <div className="flex gap-3 justify-end">
          <button data-dismiss onClick={() => !loading && onCancel?.()} disabled={loading} className="btn-ghost text-sm cursor-pointer disabled:opacity-50">
            {cancelLabel || t('cancel')}
          </button>
          <button
            onClick={() => !loading && onConfirm?.()}
            disabled={loading}
            className={`text-sm px-4 py-2 rounded-xl font-medium text-white cursor-pointer transition-colors disabled:opacity-60 ${danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-brand-600 hover:bg-brand-700'}`}
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                {t('loading')}
              </span>
            ) : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
