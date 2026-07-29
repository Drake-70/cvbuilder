import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { initGoogleSignIn } from '../utils/googleSignIn';
import logoImg from '../assets/cvboost-logo.png';

export default function LoginPage() {
  const { t } = useTranslation('auth');
  const { t: tCommon } = useTranslation('common');
  const { login, googleLogin } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const googleBtnRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError(t('invalid_email', 'Please enter a valid email address'));
      return;
    }
    setLoading(true);
    try {
      await login(form.email, form.password);
      toast.success(t('welcome_back'), t('login_subtitle'));
      navigate('/dashboard');
    } catch (err) {
      const msg = err.response?.data?.error || t('invalid_credentials');
      setError(msg);
      toast.error('Login Failed', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleCredential = async (credential) => {
    try {
      await googleLogin(credential);
      toast.success(t('welcome_back'), 'Signed in with Google');
      navigate('/dashboard');
    } catch (err) {
      const msg = err.response?.data?.error || 'Google sign-in failed';
      setError(msg);
      toast.error('Google Sign-In Failed', msg);
    }
  };

  useEffect(() => {
    initGoogleSignIn({
      clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      onCredential: handleGoogleCredential,
      buttonRef: googleBtnRef
    });
  }, []);

  return (
    <div className="min-h-screen flex">
      {/* Left Panel — Illustration */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-brand-600 via-brand-700 to-indigo-900 items-center justify-center" aria-hidden="true">
        <div className="absolute inset-0">
          <div className="absolute top-20 left-16 w-72 h-72 bg-white/5 rounded-full blur-3xl animate-float" />
          <div className="absolute bottom-20 right-16 w-96 h-96 bg-brand-400/10 rounded-full blur-3xl animate-float-delayed" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-brand-300/5 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 text-center px-12 max-w-lg animate-slide-in-left">
          <div className="w-20 h-20 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center mx-auto mb-8 border border-white/20">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10,9 9,9 8,9"/>
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-white mb-4">Welcome back to CVBoost</h2>
          <p className="text-brand-100 text-lg leading-relaxed">
            Sign in to access your tailored CVs, cover letters, and interview prep tools.
          </p>
          <div className="mt-10 flex items-center justify-center gap-6 text-brand-200 text-sm">
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20,6 9,17 4,12"/>
              </svg>
              ATS-Optimized
            </div>
            <div className="w-px h-4 bg-brand-400/40" />
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20,6 9,17 4,12"/>
              </svg>
              AI-Powered
            </div>
            <div className="w-px h-4 bg-brand-400/40" />
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20,6 9,17 4,12"/>
              </svg>
              FR/EN
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel — Form */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-8 py-12 bg-surface-50 dark:bg-surface-900">
        <div className="w-full max-w-md animate-slide-up">
          <div className="text-center mb-8 lg:hidden">
            <img src={logoImg} alt="CVBoost" className="h-10 w-auto mx-auto mb-4" />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-surface-900 dark:text-white">{t('welcome_back')}</h1>
            <p className="text-surface-500 dark:text-surface-400 mt-1">{t('login_subtitle')}</p>
          </div>

          <div className="mt-8">
            {/* Google Sign-In Button */}
            {import.meta.env.VITE_GOOGLE_CLIENT_ID && (
              <>
                <div ref={googleBtnRef} className="flex justify-center mb-4" />
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-surface-200 dark:border-surface-700" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-3 bg-surface-50 dark:bg-surface-900 text-surface-400">{tCommon('or')}</span>
                  </div>
                </div>
              </>
            )}

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              {error && (
                <div className="flex items-center gap-2 bg-rose-50 text-rose-700 text-sm p-3.5 rounded-xl border border-rose-100 animate-scale-in" role="alert">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="15" y1="9" x2="9" y2="15"/>
                    <line x1="9" y1="9" x2="15" y2="15"/>
                  </svg>
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="login-email" className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">{t('email')}</label>
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="input-field"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="login-password" className="block text-sm font-medium text-surface-700 dark:text-surface-300">{t('password')}</label>
                  <Link to="/forgot-password" className="text-xs font-medium text-brand-600 hover:text-brand-700 no-underline">
                    {t('forgot_password')}
                  </Link>
                </div>
                <input
                  id="login-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="input-field"
                  placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                />
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
                {loading && (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                )}
                {loading ? t('logging_in') : t('login_button')}
              </button>
            </form>
          </div>

          <p className="text-center text-sm text-surface-500 dark:text-surface-400 mt-8">
            {t('no_account')}{' '}
            <Link to="/register" className="font-semibold text-brand-600 hover:text-brand-700 no-underline">
              {t('register')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
