import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useToast } from '../contexts/ToastContext';
import api from '../services/api';
import logoImg from '../assets/cvboost-logo.png';

export default function ResetPasswordPage() {
  const { t } = useTranslation('auth');
  const { t: tCommon } = useTranslation('common');
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-900 px-4">
        <div className="text-center animate-slide-up">
          <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center mx-auto mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-rose-500">
              <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
          </div>
          <h1 className="text-xl font-bold text-surface-900 dark:text-white mb-2">Invalid Reset Link</h1>
          <p className="text-surface-500 dark:text-surface-400 mb-6">This password reset link is invalid or missing a token.</p>
          <Link to="/forgot-password" className="btn-primary no-underline inline-block">
            Request a New Link
          </Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error('Passwords Do Not Match', t('passwords_mismatch'));
      return;
    }
    if (password.length < 6) {
      toast.error('Password Too Short', t('password_too_short'));
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setSuccess(true);
      toast.success(t('password_reset_success'), 'You can now log in with your new password.');
    } catch (err) {
      const msg = err.response?.data?.error || tCommon('server_error');
      toast.error('Reset Failed', msg);
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
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-white mb-4">Create a New Password</h2>
          <p className="text-brand-100 text-lg leading-relaxed">
            Choose a strong password to secure your CVBoost account.
          </p>
        </div>
      </div>

      {/* Right Panel — Form */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-8 py-12 bg-surface-50 dark:bg-surface-900">
        <div className="w-full max-w-md animate-slide-up">
          <div className="text-center mb-8 lg:hidden">
            <img src={logoImg} alt="CVBoost" className="h-10 w-auto mx-auto mb-4" />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-surface-900 dark:text-white">{t('reset_password')}</h1>
            <p className="text-surface-500 dark:text-surface-400 mt-1">Enter your new password below.</p>
          </div>

          <div className="mt-8">
            {success ? (
              <div className="text-center animate-fade-in">
                <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mx-auto mb-4">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-emerald-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22,4 12,14.01 9,11.01"/>
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-surface-900 dark:text-white mb-2">{t('password_reset_success')}</h2>
                <p className="text-sm text-surface-500 dark:text-surface-400 mb-6">
                  Your password has been updated. You can now sign in.
                </p>
                <Link to="/login" className="btn-primary inline-block no-underline">
                  {t('back_to_login')}
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                <div>
                  <label htmlFor="reset-password" className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">{t('password')}</label>
                  <input
                    id="reset-password"
                    type="password"
                    required
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-field"
                    placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                    autoFocus
                  />
                </div>
                <div>
                  <label htmlFor="reset-confirm" className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">{t('confirm_password')}</label>
                  <input
                    id="reset-confirm"
                    type="password"
                    required
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="input-field"
                    placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                  />
                  {confirmPassword && password !== confirmPassword && (
                    <p className="text-rose-500 text-xs mt-1.5">{t('passwords_mismatch')}</p>
                  )}
                </div>

                <button type="submit" disabled={loading || !password || !confirmPassword} className="btn-primary w-full flex items-center justify-center gap-2">
                  {loading && (
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                  )}
                  {loading ? tCommon('loading') : t('reset_password')}
                </button>
              </form>
            )}
          </div>

          <p className="text-center text-sm text-surface-500 dark:text-surface-400 mt-8">
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
