import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import PaymentModal from '../components/PaymentModal';
import { useCache } from '../hooks/useCache';
import { PricingSkeleton } from '../components/Skeleton';

export default function PricingPage() {
  const { t } = useTranslation('common');
  const { user, fetchUser } = useAuth();
  const { data: pricing, isLoading } = useCache('/payments/pricing', { staleTime: 300_000 });
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState('one-time');

  const openPayment = (type) => {
    setModalType(type);
    setModalOpen(true);
  };

  const handleSuccess = () => {
    fetchUser();
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 sm:py-16 animate-slide-up" role="main">
      <div className="text-center mb-12">
        <h1 className="text-3xl sm:text-4xl font-bold text-surface-900 mb-3">Simple, Transparent Pricing</h1>
        <p className="text-surface-500 max-w-lg mx-auto">
          Pay once per document, or subscribe for unlimited tailoring. All prices in XAF.
        </p>
      </div>

      {user?.subscriptionStatus === 'active' && (
        <div className="card bg-gradient-to-r from-emerald-500 to-emerald-600 border-0 p-5 mb-8 text-center text-white" role="status">
          <h3 className="font-bold text-lg">You have an active subscription!</h3>
          <p className="text-emerald-100 text-sm mt-1">Unlimited CV tailoring and downloads included.</p>
        </div>
      )}

      {isLoading ? (
        <PricingSkeleton />
      ) : (
      <div className="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
        {/* One-time */}
        <div className="card p-6 sm:p-8 relative">
          <h3 className="text-lg font-bold text-surface-900 mb-1">One-time Download</h3>
          <p className="text-sm text-surface-500 mb-6">Perfect for a single application</p>

          <div className="mb-6">
            <span className="text-4xl font-extrabold text-surface-900">
              {pricing ? pricing.oneTime.amount.toLocaleString() : '...'}
            </span>
            <span className="text-surface-500 ml-1">XAF</span>
          </div>

          <ul className="space-y-3 mb-8">
            {[
              'Tailored CV (.docx)',
              'Matching cover letter',
              'Gap analysis',
              'ATS-friendly format',
              'One-time payment'
            ].map((feature, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-surface-600">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                  <polyline points="20,6 9,17 4,12"/>
                </svg>
                {feature}
              </li>
            ))}
          </ul>

          <button onClick={() => openPayment('one-time')} className="btn-secondary w-full" disabled={user?.subscriptionStatus === 'active'}>
            {user?.subscriptionStatus === 'active' ? 'Included in subscription' : 'Pay & Download'}
          </button>
        </div>

        {/* Subscription */}
        <div className="card p-6 sm:p-8 relative border-2 border-brand-400">
          <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
            <span className="badge badge-brand px-3 py-1">Best Value</span>
          </div>

          <h3 className="text-lg font-bold text-surface-900 mb-1">Monthly Subscription</h3>
          <p className="text-sm text-surface-500 mb-6">Unlimited tailoring for active job seekers</p>

          <div className="mb-6">
            <span className="text-4xl font-extrabold text-surface-900">
              {pricing ? pricing.subscription.amount.toLocaleString() : '...'}
            </span>
            <span className="text-surface-500 ml-1">XAF / month</span>
          </div>

          <ul className="space-y-3 mb-8">
            {[
              'Unlimited CV tailoring',
              'Unlimited cover letters',
              'Unlimited downloads (.docx)',
              'Gap analysis for each',
              'Cancel anytime'
            ].map((feature, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-surface-600">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                  <polyline points="20,6 9,17 4,12"/>
                </svg>
                {feature}
              </li>
            ))}
          </ul>

          <button onClick={() => openPayment('subscription')} className="btn-primary w-full">
            Subscribe Now
          </button>
        </div>
      </div>
      )}

      {pricing?.sandbox && (
        <p className="text-center text-xs text-amber-600 mt-8 bg-amber-50 rounded-xl p-3 max-w-md mx-auto">
          Sandbox mode active — payment amounts are reduced for testing.
        </p>
      )}

      <PaymentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={handleSuccess}
        type={modalType}
      />
    </div>
  );
}
