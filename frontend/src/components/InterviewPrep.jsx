import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import PaymentModal from './PaymentModal';

export default function InterviewPrep({ jobDescription, tailoredCV, language }) {
  const { user, fetchUser } = useAuth();
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [paymentOpen, setPaymentOpen] = useState(false);

  const isSubscribed = user?.subscriptionStatus === 'active'
    && user?.subscriptionExpiresAt
    && new Date(user.subscriptionExpiresAt) > new Date();

  const handleGenerate = async () => {
    if (!isSubscribed) {
      setPaymentOpen(true);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await api.post('/interview-prep', { jobDescription, tailoredCV, language });
      setQuestions(res.data.questions || []);
    } catch (err) {
      if (err.response?.status === 402) {
        setPaymentOpen(true);
      } else {
        setError(err.response?.data?.error || 'Failed to generate questions.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-6">
      <button onClick={handleGenerate} disabled={loading} className="btn-secondary w-full flex items-center justify-center gap-2">
        {loading ? (
          <>
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            Generating...
          </>
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a10 10 0 1 0 10 10H12V2z"/>
              <path d="M20.66 8A10 10 0 0 0 12 2v10h10a10 10 0 0 0-1.34-4z"/>
            </svg>
            {isSubscribed ? 'Generate Interview Questions' : 'Interview Prep (Subscribers Only)'}
          </>
        )}
      </button>

      {!isSubscribed && (
        <p className="text-center text-xs text-surface-400 mt-2">
          Available with monthly subscription
        </p>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-rose-50 text-rose-700 text-sm p-3 rounded-xl border border-rose-100 mt-4">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {error}
        </div>
      )}

      {questions.length > 0 && (
        <div className="mt-5 space-y-3 animate-slide-up">
          <h3 className="text-sm font-bold text-surface-900 mb-3">Likely Interview Questions</h3>
          {questions.map((q, i) => (
            <div key={i} className="card overflow-hidden animate-slide-up" style={{ animationDelay: `${i * 0.05}s` }}>
              <button
                onClick={() => setExpanded(expanded === i ? null : i)}
                className="w-full p-4 text-left flex items-start gap-3 hover:bg-surface-50 transition-colors cursor-pointer"
              >
                <span className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <span className="text-sm font-medium text-surface-900 flex-1">{q.question}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-surface-400 flex-shrink-0 transition-transform ${expanded === i ? 'rotate-180' : ''}`}>
                  <polyline points="6,9 12,15 18,9"/>
                </svg>
              </button>

              {expanded === i && q.starGuidance && (
                <div className="px-4 pb-4 pt-0 ml-9 animate-slide-up">
                  <div className="bg-surface-50 rounded-xl p-3.5 space-y-2">
                    <p className="text-xs font-bold text-brand-600 uppercase tracking-wider mb-2">STAR Method Guidance</p>
                    {[
                      { label: 'Situation', value: q.starGuidance.situation, color: 'bg-blue-100 text-blue-700' },
                      { label: 'Task', value: q.starGuidance.task, color: 'bg-amber-100 text-amber-700' },
                      { label: 'Action', value: q.starGuidance.action, color: 'bg-emerald-100 text-emerald-700' },
                      { label: 'Result', value: q.starGuidance.result, color: 'bg-purple-100 text-purple-700' }
                    ].map((item) => item.value && (
                      <div key={item.label} className="flex gap-2">
                        <span className={`badge text-[10px] font-bold flex-shrink-0 ${item.color}`}>{item.label}</span>
                        <p className="text-xs text-surface-600 leading-relaxed">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <PaymentModal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        onSuccess={() => { fetchUser(); }}
        type="subscription"
      />
    </div>
  );
}
