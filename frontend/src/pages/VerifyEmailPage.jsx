import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import api from '../services/api';

export default function VerifyEmailPage() {
  // authLoading matters: `user` is null until the session fetch resolves, and
  // without waiting for it a signed-in user briefly sees the "link invalid"
  // error before the pending state appears.
  const { user, loading: authLoading, resendVerification, fetchUser, logout } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  // 'pending' is the state a user lands in when ProtectedRoute sends them here
  // without a token. It is the normal onboarding step, not an error, so it must
  // not borrow the "invalid or expired" wording.
  const [state, setState] = useState('loading');
  const [resending, setResending] = useState(false);

  // No token means ProtectedRoute sent the user here. Split from the verify
  // effect below so that refetching the user after a successful verify cannot
  // re-trigger the verification request.
  useEffect(() => {
    if (token) return;
    // Still resolving the session: stay on the spinner rather than guessing.
    if (authLoading) return;
    setState(user ? 'pending' : 'error');
  }, [token, user, authLoading]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api
      .get('/auth/verify-email', { params: { token } })
      .then(async () => {
        if (!cancelled) setState('success');
        // The cached session user still says emailVerified: false, which would
        // bounce the user straight back to this page on the dashboard redirect.
        await fetchUser();
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => { cancelled = true; };
  }, [token, fetchUser]);

  const handleResend = async () => {
    setResending(true);
    try {
      await resendVerification();
      toast.success('Email Sent', 'A new verification link has been sent to your inbox.');
      setState('pending');
    } catch (err) {
      const msg = err.response?.data?.error || 'Could not resend the verification email';
      toast.error('Resend Failed', msg);
    } finally {
      setResending(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await logout();
    } finally {
      // Full navigation, not a client-side redirect: the AuthContext user is
      // cleared, and a soft navigate would leave a stale in-memory state behind.
      window.location.href = '/login';
    }
  };

  const Spinner = (
    <svg className="animate-spin h-10 w-10" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
    </svg>
  );

  const content = {
    loading: {
      icon: Spinner,
      title: 'Verifying your email…',
      body: 'Please wait a moment.'
    },
    pending: {
      icon: (
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-brand-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2"/>
          <polyline points="22,6 12,13 2,6"/>
        </svg>
      ),
      title: 'Check your inbox',
      body: user
        ? `We sent a confirmation link to ${user.email}. Open it to finish setting up your account.`
        : 'We sent a confirmation link to your email. Open it to finish setting up your account.',
      action: (
        <button type="button" onClick={handleResend} disabled={resending} className="btn-primary w-full flex items-center justify-center gap-2">
          {resending && (
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          )}
          {resending ? 'Sending…' : 'Resend verification email'}
        </button>
      )
    },
    success: {
      icon: (
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-emerald-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22,4 12,14.01 9,11.01"/>
        </svg>
      ),
      title: 'Email verified!',
      body: 'Your CVBoost account is confirmed. You can now use all features.',
      action: (
        <Link to="/dashboard" className="btn-primary inline-block no-underline">
          Go to Dashboard
        </Link>
      )
    },
    error: {
      icon: (
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-rose-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
      ),
      title: 'Verification link invalid or expired',
      body: 'Request a new link below or try signing in again.'
    }
  }[state];

  const tone =
    state === 'success'
      ? 'bg-emerald-50 dark:bg-emerald-900/20'
      : state === 'error'
        ? 'bg-rose-50 dark:bg-rose-900/20'
        : 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400';

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-900 px-4">
      <div className="w-full max-w-md text-center animate-slide-up">
        <div className={`w-20 h-20 rounded-2xl mx-auto mb-6 flex items-center justify-center ${tone}`}>
          {content.icon}
        </div>
        <h1 className="text-2xl font-bold text-surface-900 dark:text-white mb-2">{content.title}</h1>
        <p className="text-surface-500 dark:text-surface-400 mb-6">{content.body}</p>

        <div className="space-y-3">
          {content.action}

          {state === 'error' && user && (
            <button type="button" onClick={handleResend} disabled={resending} className="btn-primary w-full flex items-center justify-center gap-2">
              {resending && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              )}
              Resend Verification Email
            </button>
          )}

          {state === 'error' && !user && (
            <Link to="/login" className="btn-primary inline-block no-underline">
              Back to Login
            </Link>
          )}

          {state === 'pending' && user && (
            <button type="button" onClick={handleSignOut} className="btn-ghost w-full">
              Use a different account
            </button>
          )}

          {state === 'success' && (
            <button type="button" onClick={handleSignOut} className="block w-full text-sm font-medium text-brand-600 hover:text-brand-700 cursor-pointer">
              Sign out and switch account
            </button>
          )}
        </div>
      </div>
    </div>
  );
}