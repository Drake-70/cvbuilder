import { useTranslation } from 'react-i18next';

export default function PathChoice({ onSelect }) {
  const { t } = useTranslation('tailor');

  return (
    <div>
      <div className="text-center mb-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-surface-900 mb-2">{t('choose_path')}</h2>
        <p className="text-surface-500">Everyone's journey starts somewhere. Pick what works for you.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <button
          onClick={() => onSelect('upload')}
          className="card p-6 text-left group cursor-pointer hover:border-brand-300 hover:shadow-md transition-all duration-200"
        >
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-md mb-4 group-hover:scale-105 transition-transform">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </div>
          <h3 className="font-bold text-surface-900 text-lg mb-1">{t('path_upload')}</h3>
          <p className="text-sm text-surface-500 leading-relaxed">{t('path_upload_desc')}</p>
          <div className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-brand-600 group-hover:gap-2.5 transition-all">
            Continue
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"/>
              <polyline points="12,5 19,12 12,19"/>
            </svg>
          </div>
        </button>

        <button
          onClick={() => onSelect('build')}
          className="card p-6 text-left group cursor-pointer hover:border-brand-300 hover:shadow-md transition-all duration-200"
        >
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-md mb-4 group-hover:scale-105 transition-transform">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </div>
          <h3 className="font-bold text-surface-900 text-lg mb-1">{t('path_build')}</h3>
          <p className="text-sm text-surface-500 leading-relaxed">{t('path_build_desc')}</p>
          <div className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-brand-600 group-hover:gap-2.5 transition-all">
            Start building
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"/>
              <polyline points="12,5 19,12 12,19"/>
            </svg>
          </div>
        </button>
      </div>
    </div>
  );
}
