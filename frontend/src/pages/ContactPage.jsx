import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import api from '../services/api';

export default function ContactPage() {
  const { t } = useTranslation('common');
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    subject: '',
    message: ''
  });
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError(t('contact.invalid_email'));
      return;
    }
    setLoading(true);

    try {
      await api.post('/contact', form);
      setSent(true);
      toast.success(t('contact.sent_toast'), t('contact.sent_desc'));
    } catch (err) {
      const msg = err.response?.data?.error || t('contact.send_failed');
      setError(msg);
      toast.error(t('contact.send_failed_toast'), msg);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="text-center max-w-md animate-scale-in">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-6">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-emerald-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20,6 9,17 4,12"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white mb-2">{t('contact.sent_title')}</h1>
          <p className="text-surface-500 dark:text-surface-400 mb-6">
            {t('contact.sent_desc')}
          </p>
          <button
            onClick={() => { setSent(false); setForm({ name: user?.name || '', email: user?.email || '', subject: '', message: '' }); }}
            className="btn-secondary"
          >
            {t('contact.another')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="py-12 sm:py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-sm font-semibold text-brand-600 uppercase tracking-wider mb-2">{t('contact.kicker')}</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-surface-900 dark:text-white mb-3">{t('contact.title')}</h1>
          <p className="text-surface-500 dark:text-surface-400 max-w-md mx-auto">
            {t('contact.desc')}
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {/* Contact Info Cards */}
          <div className="space-y-4">
            {[
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                  </svg>
                ),
                label: t('contact.email_label'),
                value: 'support@cvboost.cm'
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                  </svg>
                ),
                label: t('contact.location_label'),
                value: 'Douala, Cameroon'
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>
                  </svg>
                ),
                label: t('contact.response_label'),
                value: t('contact.response_value')
              }
            ].map((info, i) => (
              <div key={i} className="card p-4 flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center text-brand-600 flex-shrink-0">
                  {info.icon}
                </div>
                <div>
                  <div className="text-xs font-semibold text-surface-400 dark:text-surface-500 uppercase tracking-wider">{info.label}</div>
                  <div className="text-sm font-medium text-surface-700 dark:text-surface-300">{info.value}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Contact Form */}
          <div className="md:col-span-2">
            <form onSubmit={handleSubmit} className="card p-6 space-y-5" noValidate>
              {error && (
                <div className="flex items-center gap-2 bg-rose-50 text-rose-700 text-sm p-3.5 rounded-xl border border-rose-100" role="alert">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                    <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                  </svg>
                  {error}
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="contact-name" className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
                    {t('contact.name_label')}
                  </label>
                  <input
                    id="contact-name"
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="input-field"
                    placeholder={t('contact.name_label')}
                  />
                </div>
                <div>
                  <label htmlFor="contact-email" className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
                    {t('contact.email_label')}
                  </label>
                  <input
                    id="contact-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="input-field"
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="contact-subject" className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">{t('contact.subject_label')}</label>
                <input
                  id="contact-subject"
                  type="text"
                  required
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  className="input-field"
                  placeholder={t('contact.subject_placeholder')}
                />
              </div>

              <div>
                <label htmlFor="contact-message" className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">{t('contact.message_label')}</label>
                <textarea
                  id="contact-message"
                  required
                  rows={5}
                  maxLength={2000}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  className="input-field resize-none"
                  placeholder={t('contact.message_placeholder')}
                />
                <div className="text-xs text-surface-400 dark:text-surface-500 text-right mt-1">{form.message.length}/2000</div>
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
                {loading && (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                )}
                {loading ? t('contact.sending') : t('contact.send')}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
