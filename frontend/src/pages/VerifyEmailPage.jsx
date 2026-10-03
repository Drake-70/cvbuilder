import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import api from '../services/api';
import VerificationCodeInput from '../components/VerificationCodeInput';

const CODE_LENGTH = 6;

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

  // Six-digit code flow. `code` is the whole string; the input component splits it.
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [codeError, setCodeError] = useState(null);

  // Server-reported status: whether a live code exists, how long it has left, how
  // many attempts remain, and when a resend is allowed. The server owns all of
  // this — the page counts down from these values rather than keeping its own copy
  // of the rules, so a change to the expiry or the cooldown needs no frontend edit.
  const [status, setStatus] = useState(null);
  const [resendIn, setResendIn] = useState(0);

  const loadStatus = useCallback(async () => {
    try {
      const res = await api.get('/auth/verification-status');
      setStatus(res.data);
      setResendIn(res.data.resendAvailableInSeconds || 0);
    } catch {
      // A failed status read is not worth an error state of its own. The code box
      // still works, and resend still works — the page just cannot pre-count.
      setStatus(null);
      setResendIn(0);
    }
  }, []);

  // No token means ProtectedRoute sent the user here. Split from the verify
  // effect below so that refetching the user after a successful verify cannot
  // re-trigger the verification request.
  useEffect(() => {
    if (token) return;
    // Still resolving the session: stay on the spinner rather than guessing.
    if (authLoading) return;
    setState(user ? 'pending' : 'error');
    if (user) loadStatus();
  }, [token, user, authLoading, loadStatus]);

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

  // The resend countdown. Driven by a single interval rather than one timeout per
  // second: a resend can be re-triggered from the success path too, and chained
  // timeouts would leave two countdowns running against each other.
  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const id = setInterval(() => {
      setResendIn((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [resendIn]);

  const handleVerifyCode = async (event) => {
    if (event) event.preventDefault();
    if (code.length !== CODE_LENGTH || submitting) return;

    setSubmitting(true);
    setCodeError(null);
    try {
      await api.post('/auth/verify-email-code', { code });
      setState('success');
      // The cached session user still says emailVerified: false, which would
      // bounce the user straight back to this page on the dashboard redirect.
      await fetchUser();
    } catch (err) {
      const data = err.response?.data || {};
      setCodeError(data.error || 'That code is not valid.');
      // Clear on a real rejection, but not on a throttle — a 429 means the code may
      // well be correct and the user should not have to retype it.
      if (err.response?.status === 400) {
        setCode('');
        // Clearing the value pulls focus back to the first empty box, so a retry
        // starts where the user expects instead of needing a click first.
        loadStatus();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      const data = await resendVerification();
      toast.success('Email sent', 'A new verification code is on its way.');
      setCodeError(null);
      // The response carries the cooldown the server applied, so the button does
      // not sit there inviting a second send that the limiter will reject.
      setResendIn(data.resendAvailableInSeconds || 60);
      loadStatus();
      setState('pending');
    } catch (err) {
      const msg = err.response?.data?.error || 'Could not resend the verification email';
      toast.error('Resend failed', msg);
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

  const MailIcon = (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-brand-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <polyline points="22,6 12,13 2,6"/>
    </svg>
  );

  const content = {
    loading: {
      icon: Spinner,
      title: 'Verifying your email…',
      body: 'Please wait a moment.'
    },
    pending: {
      icon: MailIcon,
      title: 'Check your inbox',
      body: user
        ? `We sent a six-digit code to ${user.email}. Enter it below, or open the link in the same email.`
        : 'We sent a six-digit code to your email. Enter it below, or open the link in the same email.'
    },
    success: {
      icon: (
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-emerald-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22,4 12,14.01 9,11.01"/>
        </svg>
      ),
      title: 'Email verified!',
      body: 'Your CVBoost account is confirmed. You can now use all features.'
    },
    error: {
      icon: (
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-rose-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
      ),
      title: 'Verification link invalid or expired',
      body: 'Request a new email below, or sign in again.'
    }
  }[state];

  const tone =
    state === 'success'
      ? 'bg-emerald-50 dark:bg-emerald-900/20'
      : state === 'error'
        ? 'bg-rose-50 dark:bg-rose-900/20'
        : 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400';

  const canSubmit = code.length === CODE_LENGTH && !submitting;
  const resendDisabled = resending || resendIn > 0;

  const resendLabel = resending
    ? 'Sending…'
    : resendIn > 0
      ? `Resend available in ${resendIn}s`
      : 'Resend email';

  // Live code hints, straight from the server's view of the account. Each is
  // suppressed when unknown rather than guessed — a wrong "expires in 0s" is worse
  // than no hint.
  const hint = codeError
    || (status?.locked
      ? 'Too many incorrect attempts. Request a new code to continue.'
      : status?.expiresInSeconds === 0
        ? 'That code has expired. Request a new one.'
        : status?.expiresInSeconds
          ? `Code expires in ${Math.ceil(status.expiresInSeconds / 60)} minute(s) · ${status.attemptsRemaining} attempt(s) left`
          : '');

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-900 px-4">
      <div className="w-full max-w-md text-center animate-slide-up">
        <div className={`w-20 h-20 rounded-2xl mx-auto mb-6 flex items-center justify-center ${tone}`}>
          {content.icon}
        </div>
        <h1 className="text-2xl font-bold text-surface-900 dark:text-white mb-2">{content.title}</h1>
        <p className="text-surface-500 dark:text-surface-400">{content.body}</p>

        {/* The code box is offered only to a signed-in unverified user. Without a
            session the endpoint would reject the code anyway, and showing an input
            that cannot possibly succeed is worse than the sign-in prompt. */}
        {state === 'pending' && user && (
          <form onSubmit={handleVerifyCode} className="mt-2">
            <VerificationCodeInput
              value={code}
              onChange={(next) => { setCode(next); if (codeError) setCodeError(null); }}
              disabled={submitting || status?.locked}
              invalid={Boolean(codeError)}
            />
            <p
              id="verification-code-hint"
              className={`text-sm min-h-5 ${codeError || status?.locked ? 'text-rose-600 dark:text-rose-400' : 'text-surface-400'}`}
            >
              {hint}
            </p>
            <button
              type="submit"
              disabled={!canSubmit}
              className="btn-primary w-full flex items-center justify-center gap-2 mt-3"
            >
              {submitting && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              )}
              {submitting ? 'Verifying…' : 'Verify email'}
            </button>
          </form>
        )}

        <div className="space-y-3 mt-4">
          {state === 'success' && (
            <Link to="/dashboard" className="btn-primary inline-block no-underline">
              Go to Dashboard
            </Link>
          )}

          {/* One resend control for both entry paths. It used to exist twice in this
              file — once in the pending state and again in the error state — with the
              countdown rendered in only one of them. */}
          {(state === 'pending' || (state === 'error' && user)) && (
            <button type="button" onClick={handleResend} disabled={resendDisabled} className="btn-ghost w-full flex items-center justify-center gap-2">
              {resending && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              )}
              {resendLabel}
            </button>
          )}

          {state === 'error' && !user && (
            <Link to="/login" className="btn-primary inline-block no-underline">
              Back to Login
            </Link>
          )}

          {state === 'pending' && user && (
            <button type="button" onClick={handleSignOut} className="block w-full text-sm font-medium text-brand-600 hover:text-brand-700 cursor-pointer">
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