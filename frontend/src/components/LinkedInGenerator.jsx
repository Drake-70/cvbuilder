import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

export default function LinkedInGenerator({ tailoredCV, jobDescription, language }) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const generate = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/linkedin', { tailoredCV, jobDescription, language });
      setProfile(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate LinkedIn profile');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text, field) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(field);
      setTimeout(() => setCopied(''), 2000);
    } catch { /* fallback */ }
  };

  if (!tailoredCV) return null;

  return (
    <div className="card p-5 animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-surface-800">{t('tailor.linkedin', 'LinkedIn Profile')}</h3>
        {!profile && (
          <button onClick={generate} disabled={loading} className="btn-ghost text-brand-600 font-medium text-sm">
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
                {t('tailor.generating', 'Generating...')}
              </span>
            ) : t('tailor.generateLinkedIn', 'Generate')}
          </button>
        )}
      </div>

      {error && <p className="text-rose-500 text-sm mb-3">{error}</p>}

      {profile && (
        <div className="space-y-4 animate-fade-in">
          {/* Headline */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-surface-500 uppercase tracking-wide">
                {t('tailor.headline', 'Headline')}
              </label>
              <button
                onClick={() => copyToClipboard(profile.headline, 'headline')}
                className="text-xs text-brand-600 hover:text-brand-700"
              >
                {copied === 'headline' ? '✓ Copied' : t('tailor.copy', 'Copy')}
              </button>
            </div>
            <div className="bg-surface-50 rounded-xl p-3.5 text-sm text-surface-700 leading-relaxed">
              {profile.headline}
            </div>
            <p className="text-xs text-surface-400 mt-1 text-right">{profile.headline.length}/220</p>
          </div>

          {/* About */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-surface-500 uppercase tracking-wide">
                {t('tailor.about', 'About Section')}
              </label>
              <button
                onClick={() => copyToClipboard(profile.about, 'about')}
                className="text-xs text-brand-600 hover:text-brand-700"
              >
                {copied === 'about' ? '✓ Copied' : t('tailor.copy', 'Copy')}
              </button>
            </div>
            <div className="bg-surface-50 rounded-xl p-4 text-sm text-surface-700 leading-relaxed whitespace-pre-line">
              {profile.about}
            </div>
            <p className="text-xs text-surface-400 mt-1 text-right">{profile.about.length}/2600</p>
          </div>
        </div>
      )}
    </div>
  );
}
