import { useTranslation } from 'react-i18next';

export default function ErrorState({ message, onRetry }) {
  const { t } = useTranslation('common');

  return (
    <div className="card p-12 text-center animate-fade-in">
      <div className="w-14 h-14 rounded-full bg-rose-50 dark:bg-rose-900/30 flex items-center justify-center mx-auto mb-4">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-rose-500">
          <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
      </div>
      <h3 className="text-lg font-bold text-surface-900 dark:text-white mb-2">{t('error')}</h3>
      <p className="text-sm text-surface-500 dark:text-surface-400 mb-6">{message || t('server_error')}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-secondary text-sm cursor-pointer">{t('try_again')}</button>
      )}
    </div>
  );
}
