import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { useToast } from '../contexts/ToastContext';

export default function PaymentModal({ open, onClose, onSuccess, documentId, type = 'one-time' }) {
  const { t } = useTranslation('common');
  const { toast } = useToast();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [provider, setProvider] = useState('mtn');
  const [step, setStep] = useState('form'); // form | waiting | success | failed
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pricing, setPricing] = useState(null);
  const pollRef = useRef(null);
  const prevFocusRef = useRef(null);
  const modalRef = useRef(null);

  useEffect(() => {
    if (open) {
      prevFocusRef.current = document.activeElement;
      api.get('/payments/pricing').then(res => setPricing(res.data)).catch(() => {});
      setStep('form');
      setPhoneNumber('');
      setError('');
      requestAnimationFrame(() => {
        const firstFocusable = modalRef.current?.querySelector('button, input, [tabindex]:not([tabindex="-1"])');
        firstFocusable?.focus();
      });
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      prevFocusRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        if (pollRef.current) clearInterval(pollRef.current);
        onClose?.();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  const detectProvider = (val) => {
    const clean = val.replace(/\s/g, '');
    if (clean.startsWith('65') || clean.startsWith('23765')) {
      setProvider('orange');
    } else {
      setProvider('mtn');
    }
  };

  const handlePhoneChange = (e) => {
    setPhoneNumber(e.target.value);
    detectProvider(e.target.value);
  };

  const handlePay = async () => {
    if (!phoneNumber.trim()) return;
    setLoading(true);
    setError('');

    try {
      const res = await api.post('/payments/initiate', {
        phoneNumber: phoneNumber.trim(),
        type,
        documentId
      });

      setStep('waiting');
      const paymentId = res.data.paymentId;

      // Poll for status
      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await api.get(`/payments/status/${paymentId}`);
          if (statusRes.data.status === 'success') {
            clearInterval(pollRef.current);
            setStep('success');
            toast.success('Payment Successful', 'Your download will start shortly.');
            setTimeout(() => {
              onSuccess?.();
              onClose?.();
            }, 1500);
          } else if (statusRes.data.status === 'failed') {
            clearInterval(pollRef.current);
            setStep('failed');
            toast.error('Payment Failed', 'The payment was not completed.');
          }
        } catch {
          // keep polling
        }
      }, 3000);

      // Stop polling after 2 minutes
      setTimeout(() => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          if (step === 'waiting') setStep('failed');
        }
      }, 120000);
    } catch (err) {
      setError(err.response?.data?.error || 'Payment initiation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    onClose?.();
  };

  const amount = type === 'subscription'
    ? pricing?.subscription?.amount
    : pricing?.oneTime?.amount;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-surface-900/40 backdrop-blur-sm" onClick={handleClose} />

      <div ref={modalRef} className="relative bg-surface-0 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-scale-in" role="dialog" aria-modal="true" aria-label="Payment">
        {/* Close button */}
        <button onClick={handleClose} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-surface-100 text-surface-400 hover:text-surface-600 cursor-pointer transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        {step === 'form' && (
          <div className="animate-fade-in">
            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center mx-auto mb-3">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>
                </svg>
              </div>
              <h3 className="text-lg font-bold text-surface-900">
                {type === 'subscription' ? 'Subscribe to CVBoost' : 'Pay to Download'}
              </h3>
              <p className="text-sm text-surface-500 mt-1">
                {amount ? `${amount.toLocaleString()} ${pricing?.currency || 'XAF'}` : 'Loading...'}
              </p>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-rose-50 text-rose-700 text-sm p-3 rounded-xl border border-rose-100 mb-4">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            )}

            {/* Provider selection */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setProvider('mtn')}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold cursor-pointer transition-all border-2 ${
                  provider === 'mtn' ? 'border-yellow-400 bg-yellow-50 text-yellow-800' : 'border-surface-200 text-surface-500 hover:border-surface-300'
                }`}
              >
                MTN MoMo
              </button>
              <button
                onClick={() => setProvider('orange')}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold cursor-pointer transition-all border-2 ${
                  provider === 'orange' ? 'border-orange-400 bg-orange-50 text-orange-800' : 'border-surface-200 text-surface-500 hover:border-surface-300'
                }`}
              >
                Orange Money
              </button>
            </div>

            {/* Phone input */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-surface-700 mb-1.5">Mobile Money Number</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-surface-400 font-medium">+237</span>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={handlePhoneChange}
                  placeholder="6XX XXX XXX"
                  className="input-field pl-14"
                />
              </div>
            </div>

            <button
              onClick={handlePay}
              disabled={loading || !phoneNumber.trim()}
              className="btn-primary w-full py-3 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Processing...
                </>
              ) : (
                `Pay ${amount ? amount.toLocaleString() : ''} XAF`
              )}
            </button>

            {pricing?.sandbox && (
              <p className="text-center text-xs text-amber-600 mt-3 bg-amber-50 rounded-lg p-2">
                Sandbox mode — use test amounts under 100 XAF
              </p>
            )}

            <p className="text-center text-xs text-surface-400 mt-3 flex items-center justify-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              7-day money-back guarantee — full refund if it doesn&apos;t help.
            </p>
          </div>
        )}

        {step === 'waiting' && (
          <div className="text-center py-6 animate-fade-in">
            <div className="w-16 h-16 rounded-2xl bg-brand-100 flex items-center justify-center mx-auto mb-4">
              <svg className="animate-pulse-soft h-7 w-7 text-brand-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
            </div>
            <h3 className="text-lg font-bold text-surface-900 mb-1">Check your phone</h3>
            <p className="text-sm text-surface-500 mb-4">
              A payment prompt has been sent to your {provider === 'mtn' ? 'MTN MoMo' : 'Orange Money'} number.
              Approve it to continue.
            </p>
            <div className="flex items-center justify-center gap-2 text-sm text-surface-400">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Waiting for confirmation...
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="text-center py-6 animate-scale-in">
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20,6 9,17 4,12"/>
              </svg>
            </div>
            <h3 className="text-lg font-bold text-surface-900 mb-1">Payment Successful!</h3>
            <p className="text-sm text-surface-500">Your download will start automatically.</p>
          </div>
        )}

        {step === 'failed' && (
          <div className="text-center py-6 animate-fade-in">
            <div className="w-16 h-16 rounded-2xl bg-rose-100 flex items-center justify-center mx-auto mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
            </div>
            <h3 className="text-lg font-bold text-surface-900 mb-1">Payment Failed</h3>
            <p className="text-sm text-surface-500 mb-4">The payment was not completed. Please try again.</p>
            <button onClick={() => setStep('form')} className="btn-primary">
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
