import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import api from '../services/api';

export default function VerifyEmailPage() {
  const { user, resendVerification } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [state, setState] = useState('loading');
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!token) {
      setState('error');
      return;
    }
    let cancelled = false;
    api
      .get('/auth/verify-email', { params: { token } })
      .then(() => {
        if (!cancelled) setState('success');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => { cancelled = true; };
  }, [token]);

  const handleResend = async () => {
    setResending(true);
    try {
      await resendVerification();
      toast.success('Email Sent', 'A new verification link has been sent to your inbox.');
      setState('resend');
    } catch (err) {
      const msg = err.response?.data?.error || 'Could not resend the verification email';
      toast.error('Resend Failed', msg);
    } finally {
      setResending(false);
    }
  };

  const content = {
    loading: {
      icon: (
        <svg className="animate-spin h-10 w-10" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      ),
      title: 'Verifying your email…',
      body: 'Please wait a moment.'
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
    },
    resend: {
      icon: (
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-emerald-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22,4 12,14.01 9,11.01"/>
        </svg>
      ),
      title: 'Verification email sent',
      body: 'Check your inbox for the new link. You can close this page.'
    }
  }[state];

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-900 px-4">
      <div className="w-full max-w-md text-center animate-slide-up">
        <div className={`w-20 h-20 rounded-2xl mx-auto mb-6 flex items-center justify-center ${
          state === 'success' || state === 'resend'
            ? 'bg-emerald-50 dark:bg-emerald-900/20'
            : state === 'error'
              ? 'bg-rose-50 dark:bg-rose-900/20'
              : 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400'
        }`}>
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

          {state === 'success' && (
            <Link to="/login" className="block text-sm font-medium text-brand-600 hover:text-brand-700 no-underline">
              Sign out and switch account
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
