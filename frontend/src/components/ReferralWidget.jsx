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

  const shareOnWhatsApp = () => {
    if (!stats?.code) return;
    const link = `${window.location.origin}/register?ref=${stats.code}`;
    const msg = `${t('referral.whatsappMsg', 'Get a free CV download when you sign up with my code! {link}').replace('{link}', link)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
  };

  const MILESTONE = 3;
  const cycleProgress = stats ? (stats.successfulReferrals || 0) % MILESTONE : 0;
  const toNextMilestone = MILESTONE - cycleProgress;
  const progressPct = (cycleProgress / MILESTONE) * 100;

  if (loading) {
    return <div className="card p-5 animate-shimmer h-40" />;
  }

  return (
    <div className="card p-5 animate-slide-up">
      <h3 className="kicker mb-4">{t('referral.title', 'Refer a Friend')}</h3>

      {stats?.code ? (
        <div className="mb-4">
          <p className="text-xs text-surface-500 mb-1.5">{t('referral.yourCode', 'Your referral code:')}</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-brand-50 rounded-xl px-4 py-2.5 font-mono text-brand-700 font-semibold text-sm tracking-wide">
              {stats.code}
            </div>
            <button onClick={copyCode} className="btn-ghost text-xs">{t('tailor.copy', 'Copy')}</button>
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={shareOnWhatsApp} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 flex-1 justify-center bg-emerald-500 text-white hover:bg-emerald-600 border-emerald-500">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              {t('referral.shareWhatsApp', 'Share on WhatsApp')}
            </button>
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
        <div className="border-t border-surface-100 dark:border-surface-700 pt-3 mt-3 grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-xl font-extrabold tracking-tight text-surface-900 dark:text-white">{stats.totalReferrals}</p>
            <p className="text-[10px] font-medium uppercase tracking-wider text-surface-400 mt-0.5">{t('referral.total', 'Referrals')}</p>
          </div>
          <div>
            <p className="text-xl font-extrabold tracking-tight text-surface-900 dark:text-white">{stats.successfulReferrals}</p>
            <p className="text-[10px] font-medium uppercase tracking-wider text-surface-400 mt-0.5">{t('referral.successful', 'Signed Up')}</p>
          </div>
          <div>
            <p className="text-xl font-extrabold tracking-tight text-brand-600 dark:text-brand-400">{stats.credits}</p>
            <p className="text-[10px] font-medium uppercase tracking-wider text-surface-400 mt-0.5">{t('referral.credits', 'Free Credits')}</p>
          </div>
        </div>
      )}

      {/* Gamification progress */}
      {stats?.successfulReferrals > 0 && (
        <div className="border-t border-surface-100 dark:border-surface-700 pt-3 mt-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] font-medium text-surface-500">
              {t('referral.milestone', 'Next milestone in {n} more referrals', { n: toNextMilestone })}
            </p>
            <p className="text-[11px] font-bold text-brand-600 dark:text-brand-400">{cycleProgress}/{MILESTONE}</p>
          </div>
          <div className="h-2 bg-surface-100 dark:bg-surface-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-500 to-brand-600 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-[11px] text-surface-400 mt-1.5">
            {stats.credits > 0
              ? t('referral.earnedMsg', 'You have earned {n} free download(s) from referrals!', { n: stats.credits })
              : t('referral.pendingMsg', 'Invite friends to start earning free downloads.')}
          </p>
        </div>
      )}
    </div>
  );
}
