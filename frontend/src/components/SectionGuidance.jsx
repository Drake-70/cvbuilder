import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

export default function SectionGuidance({ cvData }) {
  const { t } = useTranslation();
  const [advice, setAdvice] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchAdvice = async () => {
    setLoading(true);
    try {
      const res = await api.post('/guidance/structure-advice', { cvData });
      setAdvice(res.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  if (!cvData) return null;

  return (
    <div className="card p-5 animate-slide-up">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-surface-800">{t('tailor.sectionGuidance', 'Section Order Advice')}</h3>
        {!advice && (
          <button onClick={fetchAdvice} disabled={loading} className="btn-ghost text-brand-600 font-medium text-sm">
            {loading ? t('tailor.loading', 'Loading...') : t('tailor.getAdvice', 'Get Advice')}
          </button>
        )}
      </div>

      {advice && (
        <div className="space-y-3 animate-fade-in">
          <div>
            <p className="text-xs font-medium text-surface-500 uppercase tracking-wide mb-2">
              {t('tailor.recommendedOrder', 'Recommended Section Order')}
            </p>
            <div className="space-y-1.5">
              {advice.sections.map((sec) => (
                <div key={sec.section} className="flex items-start gap-3 bg-surface-50 rounded-xl p-3">
                  <span className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    {sec.order}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-surface-800 capitalize">{sec.section}</p>
                    <p className="text-xs text-surface-500">{sec.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {advice.tips.length > 0 && (
            <div className="bg-brand-50/50 rounded-xl p-3.5">
              <p className="text-xs font-medium text-brand-700 mb-2">{t('tailor.extraTips', 'Extra tips:')}</p>
              <ul className="space-y-1">
                {advice.tips.map((tip, i) => (
                  <li key={i} className="text-xs text-surface-600 flex items-start gap-2">
                    <span className="text-brand-400 mt-0.5 flex-shrink-0">💡</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
