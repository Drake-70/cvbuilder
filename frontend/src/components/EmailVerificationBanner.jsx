import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

/**
 * Persistent "verify your email" banner, modelled on GitHub's.
 *
 * Deliberately non-blocking: the account works, it just carries a reminder.
 * GitHub gates far more than this does, and a hard gate on a product that
 * already depends on a third-party mail provider would mean a mail outage locks
 * everyone out of their own account.
 */
export default function EmailVerificationBanner({ onDismiss }) {
  const { user, resendVerification } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [sending, setSending] = useState(false);

  if (!user || user.emailVerified) return null;

  const handleResend = async () => {
    setSending(true);
    try {
      await resendVerification();
      toast.success('Verification sent', 'Check your inbox for the confirmation link.');
    } catch (err) {
      toast.error('Could not send', err.response?.data?.error || 'Please try again shortly.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/60">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-center gap-3 text-sm">
        <p className="text-amber-900 dark:text-amber-200 text-center">
          <strong className="font-semibold">Verify your email address.</strong>{' '}
          <span className="text-amber-800 dark:text-amber-300">
            This keeps your account secure and lets us reach you about your applications.
          </span>
        </p>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleResend}
            disabled={sending}
            className="text-amber-900 dark:text-amber-200 hover:underline font-medium cursor-pointer disabled:opacity-60"
          >
            {sending ? 'Sending…' : 'Resend'}
          </button>
          <span className="text-amber-400 dark:text-amber-700">·</span>
          <button
            type="button"
            onClick={() => navigate('/verify-email')}
            className="text-amber-900 dark:text-amber-200 hover:underline font-medium cursor-pointer"
          >
            Verify now
          </button>
          {onDismiss && (
            <>
              <span className="text-amber-400 dark:text-amber-700">·</span>
              <button
                type="button"
                onClick={onDismiss}
                aria-label="Dismiss"
                className="text-amber-700 dark:text-amber-400 hover:text-amber-900 cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}