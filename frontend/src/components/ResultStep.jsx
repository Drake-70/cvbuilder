import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import PaymentModal from './PaymentModal';
import InterviewPrep from './InterviewPrep';
import ATSScoreCard from './ATSScoreCard';
import LinkedInGenerator from './LinkedInGenerator';
import CVPreview from './CVPreview';

export default function ResultStep({ result, onDownload, onReset, loading, documentId }) {
  const { t } = useTranslation('tailor');
  const { t: tCommon } = useTranslation('common');
  const { user } = useAuth();
  const [tab, setTab] = useState('cv');
  const [view, setView] = useState('preview');
  const [template, setTemplate] = useState('modern');
  const [paymentOpen, setPaymentOpen] = useState(false);

  const cv = result.tailoredCV || {};
  const coverLetter = result.coverLetter || '';
  const gaps = result.gapAnalysis || [];

  const tabs = [
    { id: 'cv', label: t('tailored_cv') },
    ...(coverLetter ? [{ id: 'cover', label: t('cover_letter') }] : []),
    ...(gaps.length > 0 ? [{ id: 'gaps', label: t('gap_analysis') }] : [])
  ];

  const isSubscribed = user?.subscriptionStatus === 'active';
  const hasCredits = (user?.freeDocumentCredits || 0) > 0;

  const handleDownloadClick = () => {
    if (isSubscribed || hasCredits) {
      onDownload(template);
    } else {
      setPaymentOpen(true);
    }
  };

  const handlePaymentSuccess = () => {
    onDownload(template);
  };

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20,6 9,17 4,12"/>
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-surface-900">{t('tailored_cv')}</h2>
          </div>
          <p className="text-sm text-surface-500 ml-10">Your CV has been tailored to match the job posting.</p>
        </div>
        <button onClick={onReset} className="btn-ghost text-sm">
          <svg className="w-4 h-4 mr-1 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
          </svg>
          {t('start_over')}
        </button>
      </div>

      {/* Tabs */}
      <div className="result-tabs flex gap-1 p-1 bg-surface-100 rounded-xl mb-4">
        {tabs.map((tabItem) => (
          <button key={tabItem.id} onClick={() => setTab(tabItem.id)} className={`flex-1 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-all duration-200 ${tab === tabItem.id ? 'bg-surface-0 text-surface-900 shadow-sm' : 'text-surface-500 hover:text-surface-700'}`}>
            {tabItem.label}
          </button>
        ))}
      </div>

      {/* View Toggle (CV tab only) */}
      {tab === 'cv' && (
        <div className="flex items-center gap-1 p-1 bg-surface-50 rounded-lg mb-4 border border-surface-100 w-fit">
          <button
            onClick={() => setView('preview')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-all duration-200 ${view === 'preview' ? 'bg-surface-0 text-surface-900 shadow-sm border border-surface-200' : 'text-surface-400 hover:text-surface-600'}`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/>
            </svg>
            {tCommon('preview')}
          </button>
          <button
            onClick={() => setView('structured')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-all duration-200 ${view === 'structured' ? 'bg-surface-0 text-surface-900 shadow-sm border border-surface-200' : 'text-surface-400 hover:text-surface-600'}`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
              <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
            Structured
          </button>
        </div>
      )}

      {/* Template Selector */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs font-medium text-surface-400">{t('template', 'Template')}:</span>
        {['modern', 'classic', 'creative'].map(tpl => (
          <button
            key={tpl}
            onClick={() => setTemplate(tpl)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all border ${
              template === tpl
                ? 'bg-brand-50 border-brand-300 text-brand-700'
                : 'bg-surface-50 border-surface-200 text-surface-500 hover:border-surface-300'
            }`}
          >
            {tpl.charAt(0).toUpperCase() + tpl.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="result-content card p-5 sm:p-6 overflow-hidden" key={`${tab}-${view}`}>
        {tab === 'cv' && view === 'preview' && (
          <CVPreview cv={cv} language={result.language} />
        )}

        {tab === 'cv' && view === 'structured' && (
          <div className="space-y-5">
            {cv.summary && (
              <div className="animate-slide-up">
                <h3 className="text-xs font-bold text-brand-600 uppercase tracking-wider mb-2">Summary</h3>
                <p className="text-sm text-surface-600 leading-relaxed">{cv.summary}</p>
              </div>
            )}
            {cv.experience && cv.experience.length > 0 && (
              <div className="animate-slide-up" style={{ animationDelay: '0.05s' }}>
                <h3 className="text-xs font-bold text-brand-600 uppercase tracking-wider mb-3">Experience</h3>
                <div className="space-y-4">
                  {cv.experience.map((exp, i) => (
                    <div key={i} className="relative pl-4 border-l-2 border-brand-100">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-semibold text-surface-900">{exp.title}</span>
                        {exp.company && <span className="text-sm text-surface-600">at {exp.company}</span>}
                      </div>
                      {exp.dates && <p className="text-xs text-surface-400 mt-0.5">{exp.dates}</p>}
                      {exp.bullets && exp.bullets.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {exp.bullets.map((b, j) => (
                            <li key={j} className="flex items-start gap-2 text-sm text-surface-600">
                              <span className="text-brand-300 mt-1.5 text-xs">&#9679;</span>{b}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {cv.education && cv.education.length > 0 && (
              <div className="animate-slide-up" style={{ animationDelay: '0.1s' }}>
                <h3 className="text-xs font-bold text-brand-600 uppercase tracking-wider mb-3">Education</h3>
                <div className="space-y-3">
                  {cv.education.map((edu, i) => (
                    <div key={i} className="relative pl-4 border-l-2 border-emerald-200">
                      <span className="font-semibold text-surface-900">{edu.degree}</span>
                      {edu.institution && <span className="text-sm text-surface-600"> &mdash; {edu.institution}</span>}
                      {edu.dates && <p className="text-xs text-surface-400 mt-0.5">{edu.dates}</p>}
                      {edu.details && <p className="text-sm text-surface-500 mt-1">{edu.details}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {cv.skills && cv.skills.length > 0 && (
              <div className="animate-slide-up" style={{ animationDelay: '0.15s' }}>
                <h3 className="text-xs font-bold text-brand-600 uppercase tracking-wider mb-2">Skills</h3>
                <div className="flex flex-wrap gap-1.5">
                  {cv.skills.map((skill, i) => (<span key={i} className="badge badge-brand">{skill}</span>))}
                </div>
              </div>
            )}
            {cv.additionalSections && cv.additionalSections.length > 0 && (
              <div>
                {cv.additionalSections.map((sec, i) => (
                  <div key={i} className="mb-3 animate-slide-up">
                    <h3 className="text-xs font-bold text-brand-600 uppercase tracking-wider mb-1">{sec.title}</h3>
                    <p className="text-sm text-surface-600 leading-relaxed">{sec.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'cover' && (
          <div className="whitespace-pre-wrap text-sm text-surface-600 leading-relaxed animate-fade-in">{coverLetter}</div>
        )}
        {tab === 'gaps' && (
          <div className="animate-fade-in">
            <p className="text-sm text-surface-500 mb-4">{t('gap_analysis_desc')}</p>
            <div className="space-y-2.5">
              {gaps.map((gap, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-amber-50/80 border border-amber-100">
                  <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                  </div>
                  <span className="text-sm text-surface-700">{gap}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Download button */}
      <div className="result-download mt-6">
        <button onClick={handleDownloadClick} disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 py-3.5 text-base">
          {loading ? (
            <>
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              {tCommon('loading')}
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7,10 12,15 17,10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              {isSubscribed ? t('download_both') : hasCredits ? t('download_both') : `Pay & ${t('download_both')}`}
            </>
          )}
        </button>

        {!isSubscribed && !hasCredits && (
          <p className="text-center text-xs text-surface-400 mt-2">
            Preview is free. Payment required to download the .docx file.
          </p>
        )}
        {hasCredits && (
          <p className="text-center text-xs text-emerald-500 mt-2">
            You have {user.freeDocumentCredits} free download credit{user.freeDocumentCredits > 1 ? 's' : ''}. This download is free.
          </p>
        )}
      </div>

      {/* Interview Prep */}
      <div className="result-extra">
        {result.tailoredCV && (
          <InterviewPrep
            jobDescription={result.jobDescription}
            tailoredCV={result.tailoredCV}
            language={result.language}
          />
        )}

        {/* ATS Score */}
        <div className="mt-4">
          <ATSScoreCard
            cvText={result.originalCVText}
            jobDescription={result.jobDescription}
            tailoredCV={result.tailoredCV}
            gapAnalysis={result.gapAnalysis}
          />
        </div>

        {/* LinkedIn Generator */}
        <div className="mt-4">
          <LinkedInGenerator
            tailoredCV={result.tailoredCV}
            jobDescription={result.jobDescription}
            language={result.language}
          />
        </div>
      </div>

      <PaymentModal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        onSuccess={handlePaymentSuccess}
        documentId={documentId}
        type="one-time"
      />
    </div>
  );
}
