import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import PaymentModal from './PaymentModal';
import InterviewPrep from './InterviewPrep';
import ATSScoreCard from './ATSScoreCard';
import LinkedInGenerator from './LinkedInGenerator';
import CVPreview from './CVPreview';
import BeforeAfterGaps from './BeforeAfterGaps';
import api from '../services/api';

export default function ResultStep({ result, onDownload, onReset, loading, documentId }) {
  const { t } = useTranslation('tailor');
  const { t: tCommon } = useTranslation('common');
  const { user } = useAuth();
  const [tab, setTab] = useState('cv');
  const [view, setView] = useState('preview');
  const [template, setTemplate] = useState('modern');
  const [format, setFormat] = useState('docx');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [grammarIssues, setGrammarIssues] = useState(null);
  const [grammarLoading, setGrammarLoading] = useState(false);
  const [grammarError, setGrammarError] = useState('');

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
      onDownload(template, format);
    } else {
      setPaymentOpen(true);
    }
  };

  const handlePaymentSuccess = () => {
    onDownload(template, format);
  };

  const shareOnWhatsApp = () => {
    const msg = t('whatsapp_share_msg', 'I just tailored my CV with CVBoost AI — you should try it! {link}')
      .replace('{link}', window.location.origin + '/tailor');
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
  };

  const buildTextForGrammar = () => {
    const parts = [];
    if (cv.summary) parts.push(`${t('section_summary')}: ${cv.summary}`);
    (cv.experience || []).forEach((exp) => {
      parts.push(`${exp.title || ''}${exp.company ? ` at ${exp.company}` : ''}`);
      (exp.bullets || []).forEach((b) => parts.push(`- ${b}`));
    });
    (cv.education || []).forEach((edu) => parts.push(`${edu.degree || ''}${edu.institution ? ` - ${edu.institution}` : ''}`));
    if (cv.skills?.length) parts.push(`${t('section_skills')}: ${cv.skills.join(', ')}`);
    if (coverLetter) parts.push(`${t('cover_letter')}:\n${coverLetter}`);
    return parts.join('\n');
  };

  const runGrammarCheck = async () => {
    setGrammarLoading(true);
    setGrammarError('');
    setGrammarIssues(null);
    try {
      const res = await api.post('/ai/grammar', { text: buildTextForGrammar(), language: result.language || 'en' });
      setGrammarIssues(res.data);
    } catch (err) {
      setGrammarError(err.response?.data?.error || t('grammar_failed', 'Failed to check grammar.'));
    } finally {
      setGrammarLoading(false);
    }
  };

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="kicker mb-2">{t('the_result')}</p>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-surface-900 dark:text-white">{t('tailored_cv')}</h2>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-2">{t('result_desc')}</p>
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
            {t('structured')}
          </button>
        </div>
      )}

      {/* Template Selector */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
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

        <span className="text-xs font-medium text-surface-400 ml-3">{t('format', 'Format')}:</span>
        {['docx', 'pdf'].map(fmt => (
          <button
            key={fmt}
            onClick={() => setFormat(fmt)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all border uppercase ${
              format === fmt
                ? 'bg-brand-50 border-brand-300 text-brand-700'
                : 'bg-surface-50 border-surface-200 text-surface-500 hover:border-surface-300'
            }`}
          >
            {fmt}
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
                <h3 className="text-xs font-bold text-brand-600 uppercase tracking-wider mb-2">{t('section_summary')}</h3>
                <p className="text-sm text-surface-600 leading-relaxed">{cv.summary}</p>
              </div>
            )}
            {cv.experience && cv.experience.length > 0 && (
              <div className="animate-slide-up" style={{ animationDelay: '0.05s' }}>
                <h3 className="text-xs font-bold text-brand-600 uppercase tracking-wider mb-3">{t('section_experience')}</h3>
                <div className="space-y-4">
                  {cv.experience.map((exp, i) => (
                    <div key={i} className="relative pl-4 border-l-2 border-brand-100">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-semibold text-surface-900">{exp.title}</span>
                        {exp.company && <span className="text-sm text-surface-600">{t('at_company', { company: exp.company })}</span>}
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
                <h3 className="text-xs font-bold text-brand-600 uppercase tracking-wider mb-3">{t('section_education')}</h3>
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
                <h3 className="text-xs font-bold text-brand-600 uppercase tracking-wider mb-2">{t('section_skills')}</h3>
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
          <BeforeAfterGaps
            originalText={result.cvText || ''}
            originalCV={result.originalCV || null}
            tailoredCV={cv}
            coverLetter={coverLetter}
            gaps={gaps}
            language={result.language}
          />
        )}
      </div>

      {/* Download + share */}
      <div className="result-download mt-6 space-y-2">
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
              {isSubscribed || hasCredits
                ? (format === 'pdf' ? t('download_pdf', 'Download as PDF') : t('download_docx'))
                : t('pay_and_download')}
            </>
          )}
        </button>

        <button onClick={shareOnWhatsApp} className="btn-secondary w-full flex items-center justify-center gap-2 py-2.5 text-sm">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          {t('share_whatsapp', 'Share on WhatsApp')}
        </button>

        {!isSubscribed && !hasCredits && (
          <p className="text-center text-xs text-surface-400 mt-2">
            {t('download_payment_hint')}
          </p>
        )}
        {hasCredits && (
          <p className="text-center text-xs text-emerald-500 mt-2">
            {t('free_credit_hint', { count: user.freeDocumentCredits })}
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

        {/* Grammar & spelling check */}
        <div className="card p-5 mt-4 animate-slide-up">
          <div className="flex items-center justify-between mb-3">
            <h3 className="kicker">{t('grammar_title', 'Grammar & Spelling Check')}</h3>
            {!grammarIssues && (
              <button onClick={runGrammarCheck} disabled={grammarLoading} className="btn-ghost text-brand-600 font-medium text-sm">
                {grammarLoading ? t('generating') : t('grammar_check', 'Check Text')}
              </button>
            )}
          </div>
          <p className="text-xs text-surface-400 mb-3">{t('grammar_desc', 'Review your tailored CV and cover letter for typos, grammar and awkward phrasing.')}</p>

          {grammarError && <p className="text-rose-500 text-sm mb-3">{grammarError}</p>}

          {grammarLoading && (
            <div className="flex items-center gap-2 text-sm text-surface-400 animate-pulse">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              {t('extractingText', 'Checking…')}
            </div>
          )}

          {grammarIssues && (
            <div className="animate-fade-in">
              {grammarIssues.issues?.length > 0 ? (
                <div className="space-y-2.5">
                  {grammarIssues.issues.map((issue, i) => (
                    <div key={i} className="rounded-xl border border-rose-100 bg-rose-50/50 p-3">
                      <p className="text-sm text-surface-700"><span className="line-through text-rose-500">{issue.original}</span> <span className="mx-1">→</span> <span className="font-semibold text-emerald-600">{issue.suggestion}</span></p>
                      <p className="text-xs text-surface-400 mt-1">{issue.reason}</p>
                    </div>
                  ))}
                  <button onClick={runGrammarCheck} className="btn-ghost text-xs text-brand-600">{t('grammar_check', 'Check Text')}</button>
                </div>
              ) : (
                <p className="text-sm text-emerald-600 flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  {t('grammar_clean', 'No issues found — your text looks great.')}
                </p>
              )}
            </div>
          )}
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
