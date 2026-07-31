import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { useCache } from '../hooks/useCache';

export default function ReferralWidget() {
  const { t } = useTranslation();
  const { data: stats, isLoading: loading, refetch: fetchStats } = useCache('/referrals/stats', { staleTime: 60_000 });
  const [code, setCode] = useState('');
  const [applyResult, setApplyResult] = useState('');

  const applyCode = async () => {
    if (!code.trim()) return;
    try {
      const res = await api.post('/referrals/apply', { code: code.trim() });
      setApplyResult(res.data.message);
      fetchStats();
    } catch (err) {
      setApplyResult(err.response?.data?.error || 'Invalid code');
    }
  };

  const copyCode = async () => {
    if (!stats?.code) return;
    try {
      await navigator.clipboard.writeText(stats.code);
    } catch { /* fallback */ }
  };

  if (loading) {
    return <div className="card p-5 animate-shimmer h-40" />;
  }

  return (
    <div className="card p-5 animate-slide-up">
      <h3 className="font-semibold text-surface-800 mb-3">{t('referral.title', 'Refer a Friend')}</h3>

      {stats?.code ? (
        <div className="mb-4">
          <p className="text-xs text-surface-500 mb-1.5">{t('referral.yourCode', 'Your referral code:')}</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-brand-50 rounded-xl px-4 py-2.5 font-mono text-brand-700 font-semibold text-sm tracking-wide">
              {stats.code}
            </div>
            <button onClick={copyCode} className="btn-ghost text-xs">{t('tailor.copy', 'Copy')}</button>
          </div>
          <p className="text-xs text-surface-400 mt-1.5">
            {t('referral.shareHint', 'Share this code with friends. You both get a free download when they sign up!')}
          </p>
        </div>
      ) : null}

      {/* Apply someone else's code */}
      <div className="border-t border-surface-100 pt-3 mt-3">
        <p className="text-xs text-surface-500 mb-1.5">{t('referral.applyCode', 'Have a referral code?')}</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t('referral.codePlaceholder', 'Enter referral code')}
            className="input-field text-sm py-2 flex-1"
          />
          <button onClick={applyCode} className="btn-secondary text-sm py-2 px-4">
            {t('referral.apply', 'Apply')}
          </button>
        </div>
        {applyResult && (
          <p className={`text-xs mt-1.5 ${applyResult.includes('success') ? 'text-emerald-500' : 'text-rose-500'}`}>
            {applyResult}
          </p>
        )}
      </div>

      {/* Stats */}
      {stats && (stats.totalReferrals > 0 || stats.credits > 0) && (
        <div className="border-t border-surface-100 pt-3 mt-3 grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-lg font-bold text-surface-800">{stats.totalReferrals}</p>
            <p className="text-[10px] text-surface-400">{t('referral.total', 'Referrals')}</p>
          </div>
          <div>
            <p className="text-lg font-bold text-emerald-500">{stats.successfulReferrals}</p>
            <p className="text-[10px] text-surface-400">{t('referral.successful', 'Signed Up')}</p>
          </div>
          <div>
            <p className="text-lg font-bold text-brand-600">{stats.credits}</p>
            <p className="text-[10px] text-surface-400">{t('referral.credits', 'Free Credits')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
