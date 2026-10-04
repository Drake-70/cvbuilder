import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

/**
 * Daily job digest opt-in.
 *
 * Opt-in rather than opt-out, and the flag defaults to false in the schema, so
 * existing accounts never start receiving a daily email they did not ask for.
 *
 * The displayed state comes from the stored user record rather than local state.
 * That matters on a save failure: if this mirrored local state, a rejected write
 * would leave the switch showing the value the user just chose while the server
 * still holds the old one, and the next scrape would do the opposite of what the
 * screen says.
 */
export default function DailyDigestCard() {
  const { t } = useTranslation('common');
  const { toast } = useToast();
  const { user, fetchUser } = useAuth();
  const [busy, setBusy] = useState(false);

  const enabled = !!user?.dailyDigest;

  const handleToggle = async () => {
    const next = !enabled;
    setBusy(true);
    try {
      await api.patch('/auth/me', { dailyDigest: next });
      // Re-read rather than assuming: the server is the only thing that decides who
      // gets mailed, so the switch must show what it now believes.
      await fetchUser();
      toast.success(
        next ? t('daily_digest_on') : t('daily_digest_off'),
        next ? t('daily_digest_on_desc') : t('daily_digest_updated')
      );
    } catch (err) {
      toast.error(t('error'), err.response?.data?.error || t('daily_digest_save_failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-6 mb-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-semibold text-surface-900 dark:text-white">{t('daily_digest')}</p>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
            {enabled ? t('daily_digest_on_desc') : t('daily_digest_desc')}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={t('toggle_daily_digest')}
          onClick={handleToggle}
          disabled={busy}
          className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 cursor-pointer disabled:opacity-60 ${
            enabled ? 'bg-brand-600' : 'bg-surface-300 dark:bg-surface-700'
          }`}
        >
          <span
            className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform ${
              enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </div>
  );
}