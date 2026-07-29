import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useToast } from '../contexts/ToastContext';
import api from '../services/api';
import logoImg from '../assets/cvboost-logo.png';

export default function ForgotPasswordPage() {
  const { t } = useTranslation('auth');
  const { t: tCommon } = useTranslation('common');
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Validation Error', 'Please enter a valid email address');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
      toast.success(t('reset_email_sent'), t('reset_email_desc'));
    } catch (err) {
      const msg = err.response?.data?.error || tCommon('server_error');
      toast.error('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel — Illustration */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-brand-600 via-brand-700 to-indigo-900 items-center justify-center" aria-hidden="true">
        <div className="absolute inset-0">
          <div className="absolute top-20 left-20 w-72 h-72 bg-white/5 rounded-full blur-3xl animate-float" />
          <div className="absolute bottom-16 right-16 w-80 h-80 bg-brand-400/10 rounded-full blur-3xl animate-float-delayed" />
        </div>
        <div className="relative z-10 text-center px-12 max-w-lg animate-slide-in-left">
          <div className="w-20 h-20 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center mx-auto mb-8 border border-white/20">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-white mb-4">Reset your password</h2>
          <p className="text-brand-100 text-lg leading-relaxed">
            Enter your email and we will send you a link to reset your password.
          </p>
        </div>
      </div>

      {/* Right Panel — Form */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-8 py-12 bg-surface-50">
        <div className="w-full max-w-md animate-slide-up">
          <div className="text-center mb-8 lg:hidden">
            <img src={logoImg} alt="CVBoost" className="h-10 w-auto mx-auto mb-4" />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-surface-900">{t('forgot_password')}</h1>
            <p className="text-surface-500 mt-1">{t('forgot_password_desc')}</p>
          </div>

          <div className="mt-8">
            {sent ? (
              <div className="text-center animate-fade-in">
                <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-emerald-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22,4 12,14.01 9,11.01"/>
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-surface-900 mb-2">{t('check_your_email')}</h2>
                <p className="text-sm text-surface-500 mb-6">
                  {t('reset_email_sent')} {email}
                </p>
                <Link to="/login" className="btn-primary inline-block no-underline">
                  {t('back_to_login')}
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                <div>
                  <label htmlFor="forgot-email" className="block text-sm font-medium text-surface-700 mb-1.5">{t('email')}</label>
                  <input
                    id="forgot-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input-field"
                    placeholder="you@example.com"
                    autoFocus
                  />
                </div>

                <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
                  {loading && (
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                  )}
                  {loading ? tCommon('loading') : t('send_reset_link')}
                </button>
              </form>
            )}
          </div>

          <p className="text-center text-sm text-surface-500 mt-8">
            <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700 no-underline inline-flex items-center gap-1">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15,18 9,12 15,6"/>
              </svg>
              {t('back_to_login')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
