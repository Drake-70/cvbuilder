import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { initGoogleSignIn } from '../utils/googleSignIn';
import logoImg from '../assets/cvboost-logo.png';

export default function RegisterPage() {
  const { t } = useTranslation('auth');
  const { t: tCommon } = useTranslation('common');
  const { register, googleLogin } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({
    name: '', email: '', password: '', confirmPassword: '',
    referralCode: searchParams.get('ref') || ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const googleBtnRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      const msg = t('invalid_email', 'Please enter a valid email address');
      setError(msg);
      toast.error('Registration Failed', msg);
      return;
    }
    if (form.password !== form.confirmPassword) {
      const msg = t('passwords_mismatch');
      setError(msg);
      toast.error('Registration Failed', msg);
      return;
    }
    if (form.password.length < 6) {
      const msg = t('password_too_short');
      setError(msg);
      toast.error('Registration Failed', msg);
      return;
    }

    setLoading(true);
    try {
      const data = await register(form.email, form.password, form.name, undefined, form.referralCode || undefined);
      if (data.exists) {
        toast.success(t('create_account'), 'Check your email if an account exists.');
        navigate('/login');
      } else {
        toast.success(t('create_account'), 'Welcome to CVBoost!');
        navigate('/dashboard');
      }
    } catch (err) {
      const msg = err.response?.data?.error || t('server_error');
      setError(msg);
      toast.error('Registration Failed', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleCredential = async (credential) => {
    try {
      await googleLogin(credential);
      toast.success(t('create_account'), 'Signed in with Google');
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
          <div className="absolute top-16 right-12 w-80 h-80 bg-white/5 rounded-full blur-3xl animate-float" />
          <div className="absolute bottom-16 left-12 w-72 h-72 bg-brand-400/10 rounded-full blur-3xl animate-float-delayed" />
          <div className="absolute top-1/3 left-1/3 w-64 h-64 bg-indigo-400/5 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 text-center px-12 max-w-lg animate-slide-in-left">
          <div className="w-20 h-20 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center mx-auto mb-8 border border-white/20">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="8.5" cy="7" r="4"/>
              <line x1="20" y1="8" x2="20" y2="14"/>
              <line x1="23" y1="11" x2="17" y2="11"/>
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-white mb-4">Start tailoring your CV today</h2>
          <p className="text-brand-100 text-lg leading-relaxed">
            Create your free account and get your first AI-tailored CV in minutes.
          </p>
          <div className="mt-10 grid grid-cols-3 gap-4">
            {[
              { num: '500+', label: 'CVs tailored' },
              { num: '98%', label: 'Satisfaction' },
              { num: '2min', label: 'Avg. time' }
            ].map((stat, i) => (
              <div key={i} className="bg-white/5 backdrop-blur-sm rounded-xl p-3 border border-white/10">
                <div className="text-xl font-bold text-white">{stat.num}</div>
                <div className="text-xs text-brand-200">{stat.label}</div>
              </div>
            ))}
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
            <h1 className="text-2xl font-bold text-surface-900 dark:text-white">{t('create_account')}</h1>
            <p className="text-surface-500 dark:text-surface-400 mt-1">{t('register_subtitle')}</p>
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
                <label htmlFor="register-name" className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">{t('name')}</label>
                <input
                  id="register-name"
                  type="text"
                  required
                  autoComplete="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input-field"
                  placeholder={t('name')}
                />
              </div>

              <div>
                <label htmlFor="register-email" className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">{t('email')}</label>
                <input
                  id="register-email"
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
                <label htmlFor="register-password" className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">{t('password')}</label>
                <input
                  id="register-password"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="input-field"
                  placeholder="6+ characters"
                />
                {form.password.length > 0 && (
                  <div className="mt-1.5 flex gap-1" aria-label="Password strength">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                          form.password.length >= i * 3
                            ? i <= 1 ? 'bg-rose-400' : i <= 2 ? 'bg-amber-400' : i <= 3 ? 'bg-yellow-400' : 'bg-emerald-400'
                            : 'bg-surface-200'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="register-confirm" className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">{t('confirm_password')}</label>
                <input
                  id="register-confirm"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={form.confirmPassword}
                  onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                  className={`input-field ${form.confirmPassword && form.password !== form.confirmPassword ? 'border-rose-300' : ''}`}
                  placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                />
                {form.confirmPassword && form.password !== form.confirmPassword && (
                  <p className="mt-1 text-xs text-rose-500">{t('passwords_mismatch')}</p>
                )}
              </div>

              <div>
                <label htmlFor="register-referral" className="block text-sm font-medium text-surface-500 dark:text-surface-400 mb-1.5">
                  {t('referral_code', 'Referral Code (optional)')}
                </label>
                <input
                  id="register-referral"
                  type="text"
                  value={form.referralCode}
                  onChange={(e) => setForm({ ...form, referralCode: e.target.value })}
                  className="input-field"
                  placeholder="Enter code"
                />
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
                {loading && (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                )}
                {loading ? t('registering') : t('register_button')}
              </button>
            </form>
          </div>

          <p className="text-center text-sm text-surface-500 dark:text-surface-400 mt-8">
            {t('has_account')}{' '}
            <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700 no-underline">
              {t('login')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
