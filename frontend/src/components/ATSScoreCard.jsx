import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

export default function ATSScoreCard({ cvText, jobDescription, tailoredCV, gapAnalysis }) {
  const { t } = useTranslation();
  const [score, setScore] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchScore = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/score', { cvText, jobDescription, tailoredCV, gapAnalysis });
      setScore(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to calculate score');
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (s) => {
    if (s >= 80) return 'text-emerald-500';
    if (s >= 60) return 'text-amber-500';
    return 'text-rose-500';
  };

  const getScoreRing = (s) => {
    if (s >= 80) return 'stroke-emerald-500';
    if (s >= 60) return 'stroke-amber-500';
    return 'stroke-rose-500';
  };

  const circumference = 2 * Math.PI * 42;
  const offset = score ? circumference - (score.score / 100) * circumference : circumference;

  if (!jobDescription) return null;

  return (
    <div className="card p-5 animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-surface-800">{t('tailor.atsScore', 'ATS Match Score')}</h3>
        {!score && (
          <button onClick={fetchScore} disabled={loading} className="btn-ghost text-brand-600 font-medium text-sm">
            {loading ? t('tailor.calculating', 'Calculating...') : t('tailor.calculate', 'Calculate Score')}
          </button>
        )}
      </div>

      {error && <p className="text-rose-500 text-sm mb-3">{error}</p>}

      {score && (
        <div className="animate-fade-in">
          <div className="flex items-center gap-6 mb-5">
            {/* Circular score */}
            <div className="relative w-24 h-24 flex-shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="#e2e8f0" strokeWidth="8" />
                <circle
                  cx="50" cy="50" r="42" fill="none"
                  className={getScoreRing(score.score)}
                  strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                  style={{ transition: 'stroke-dashoffset 1s ease-out' }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-2xl font-bold ${getScoreColor(score.score)}`}>{score.score}</span>
              </div>
            </div>

            {/* Breakdown bars */}
            <div className="flex-1 space-y-2">
              {Object.entries(score.breakdown).map(([key, val]) => (
                <div key={key}>
                  <div className="flex justify-between text-xs text-surface-500 mb-0.5">
                    <span className="capitalize">{key}</span>
                    <span>{val}%</span>
                  </div>
                  <div className="h-1.5 bg-surface-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        val >= 80 ? 'bg-emerald-500' : val >= 60 ? 'bg-amber-500' : 'bg-rose-500'
                      }`}
                      style={{ width: `${val}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tips */}
          {score.tips.length > 0 && (
            <div className="bg-brand-50/50 rounded-xl p-3.5">
              <p className="text-xs font-medium text-brand-700 mb-2">{t('tailor.tips', 'Tips to improve your score:')}</p>
              <ul className="space-y-1">
                {score.tips.map((tip, i) => (
                  <li key={i} className="text-xs text-surface-600 flex items-start gap-2">
                    <span className="text-brand-400 mt-0.5 flex-shrink-0">•</span>
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
