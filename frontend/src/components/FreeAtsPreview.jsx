import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

function ScoreRing({ score }) {
  const circumference = 2 * Math.PI * 42;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? 'text-emerald-500' : score >= 60 ? 'text-amber-500' : 'text-rose-500';
  const ring = score >= 80 ? 'stroke-emerald-500' : score >= 60 ? 'stroke-amber-500' : 'stroke-rose-500';

  return (
    <div className="relative w-24 h-24 flex-shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="42" fill="none" stroke="var(--color-surface-200)" strokeWidth="8" />
        <circle
          cx="50" cy="50" r="42" fill="none"
          className={ring}
          strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-2xl font-bold ${color}`}>{score}</span>
      </div>
    </div>
  );
}

export default function FreeAtsPreview() {
  const [cvText, setCvText] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [language, setLanguage] = useState('en');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const handleAnalyze = async (e) => {
    e.preventDefault();
    setError('');
    if (!cvText.trim() || cvText.trim().length < 20) {
      setError('Paste your CV text first (at least a few lines).');
      return;
    }
    if (!jobDescription.trim() || jobDescription.trim().length < 20) {
      setError('Paste the job description you are targeting.');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await api.post('/preview/ats', { cvText, jobDescription, language });
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not analyze your CV. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="py-16 sm:py-20 px-4 bg-surface-0 dark:bg-surface-800 border-y border-surface-100 dark:border-surface-700" aria-labelledby="preview-heading">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-sm font-semibold text-brand-600 uppercase tracking-wider mb-2">Free ATS preview</p>
          <h2 id="preview-heading" className="text-2xl sm:text-3xl font-bold text-surface-900 dark:text-white">See your real ATS match score — free</h2>
          <p className="text-surface-500 dark:text-surface-400 max-w-lg mx-auto mt-2">
            Paste your CV and a job posting. Get your match score, the gaps, and a taste of how AI would rewrite it. No account needed.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Input */}
          <form onSubmit={handleAnalyze} className="card p-5 sm:p-6 space-y-4" noValidate>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="preview-cv" className="block text-sm font-medium text-surface-700 dark:text-surface-300">Your CV</label>
                <span className="text-xs text-surface-400">Paste or type</span>
              </div>
              <textarea
                id="preview-cv"
                value={cvText}
                onChange={(e) => setCvText(e.target.value)}
                rows={6}
                placeholder="John Doe, Marketing Assistant in Douala... (paste your CV text)"
                className="input-field w-full resize-y font-mono text-xs"
              />
            </div>

            <div>
              <label htmlFor="preview-jd" className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">Job description</label>
              <textarea
                id="preview-jd"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                rows={5}
                placeholder="Marketing Assistant needed in Douala..."
                className="input-field w-full resize-y font-mono text-xs"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-surface-500">Output language:</span>
              <div className="flex gap-1 p-1 bg-surface-100 rounded-lg">
                {['en', 'fr'].map((lng) => (
                  <button
                    key={lng}
                    type="button"
                    onClick={() => setLanguage(lng)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold cursor-pointer transition-all ${
                      language === lng ? 'bg-surface-0 text-brand-600 shadow-sm' : 'text-surface-400 hover:text-surface-600'
                    }`}
                  >
                    {lng === 'en' ? 'EN' : 'FR'}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-rose-50 text-rose-700 text-sm p-3 rounded-xl border border-rose-100" role="alert">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                  <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
              {loading && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              )}
              {loading ? 'Analyzing your CV…' : 'Analyze my CV for free'}
            </button>
            <p className="text-center text-xs text-surface-400">Free forever — your CV is only used to generate this preview.</p>
          </form>

          {/* Result */}
          <div className="card p-5 sm:p-6 bg-gradient-to-br from-surface-50 to-surface-0 dark:from-surface-800 dark:to-surface-900 border border-surface-100 dark:border-surface-700">
            {!result && !loading && (
              <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-center text-surface-400 dark:text-surface-500">
                <div className="w-14 h-14 rounded-2xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center mb-4">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-500">
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                  </svg>
                </div>
                <p className="text-sm max-w-xs">Your free ATS match score, missing keywords, and an AI-rewritten summary teaser appear here.</p>
              </div>
            )}

            {loading && (
              <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-center text-surface-400">
                <svg className="animate-spin h-8 w-8 mb-4 text-brand-500" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                <p className="text-sm">Analyzing your CV against the job description…</p>
              </div>
            )}

            {result && (
              <div className="space-y-5 animate-fade-in">
                <div className="flex items-center gap-6">
                  <ScoreRing score={result.score} />
                  <div className="flex-1 space-y-2">
                    {Object.entries(result.breakdown).map(([key, val]) => (
                      <div key={key}>
                        <div className="flex justify-between text-xs text-surface-500 mb-0.5">
                          <span className="capitalize">{key}</span>
                          <span>{val}%</span>
                        </div>
                        <div className="h-1.5 bg-surface-100 dark:bg-surface-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${
                              val >= 80 ? 'bg-emerald-500' : val >= 60 ? 'bg-amber-500' : 'bg-rose-500'
                            }`}
                            style={{ width: `${val}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {result.summaryTeaser && (
                  <div className="bg-brand-50/60 dark:bg-brand-900/20 rounded-xl p-4">
                    <p className="text-xs font-semibold text-brand-600 uppercase tracking-wider mb-1.5">How AI would rewrite your summary</p>
                    <p className="text-sm text-surface-600 dark:text-surface-300 leading-relaxed">&ldquo;{result.summaryTeaser}&rdquo;</p>
                  </div>
                )}

                {result.gaps.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-2">Top gaps in your CV</p>
                    <div className="space-y-2">
                      {result.gaps.map((gap, i) => (
                        <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50/80 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/30">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500 mt-0.5 flex-shrink-0">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                          </svg>
                          <span className="text-sm text-surface-700 dark:text-surface-300">{gap}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t border-surface-100 dark:border-surface-700">
                  <Link to="/register" className="btn-primary w-full flex items-center justify-center gap-2 no-underline">
                    Unlock your full tailored CV &amp; cover letter
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12,5 19,12 12,19"/>
                    </svg>
                  </Link>
                  <p className="text-center text-xs text-surface-400 mt-2">Your first download is free.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
