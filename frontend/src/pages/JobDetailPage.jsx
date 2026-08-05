import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useCache } from '../hooks/useCache';
import ApplyModal from '../components/ApplyModal';
import { relativeTime } from '../utils/relativeTime';

const SOURCE_LABELS = {
  goafrica: 'Go Africa Online',
  myjobmag: 'MyJobMag',
  emploi: 'Emploi.cm',
  jobberman: 'Jobberman',
  camerjobs: 'CamerJobs',
  careerjet: 'CareerJet'
};

export default function JobDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation('jobs');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const navigate = useNavigate();

  const [showApply, setShowApply] = useState(false);
  const [applied, setApplied] = useState(false);

  const { data, isLoading, error } = useCache(`/jobs/${id}`, { staleTime: 60_000 });
  const job = data?.job;

  const { data: appsData } = useCache('/jobs/applications', { enabled: !!user });
  const alreadyApplied = (appsData?.applications || []).some((a) => (a.jobId?._id || a.jobId) === id);

  const handleApplied = () => setApplied(true);

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10 animate-slide-up">
        <div className="animate-shimmer h-6 w-48 rounded mb-4" />
        <div className="animate-shimmer h-8 w-3/4 rounded mb-6" />
        <div className="animate-shimmer h-3 w-full rounded mb-3" />
        <div className="animate-shimmer h-3 w-full rounded mb-3" />
        <div className="animate-shimmer h-3 w-2/3 rounded" />
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center animate-fade-in">
        <div className="w-14 h-14 rounded-full bg-surface-100 dark:bg-surface-700 flex items-center justify-center mx-auto mb-4">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-surface-400">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        </div>
        <h1 className="text-xl font-bold text-surface-900 dark:text-white mb-2">{t('job_not_found')}</h1>
        <p className="text-sm text-surface-500 dark:text-surface-400 mb-6">{t('job_not_found_desc')}</p>
        <Link to="/jobs" className="btn-primary no-underline text-sm inline-flex">{t('back_to_jobs')}</Link>
      </div>
    );
  }

  const isApplied = applied || alreadyApplied;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12 animate-slide-up" role="main">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm text-surface-500 dark:text-surface-400 hover:text-brand-600 dark:hover:text-brand-400 mb-6 cursor-pointer"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12,19 5,12 12,5"/>
        </svg>
        {t('back_to_jobs')}
      </button>

      <div className="card p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
          <div className="min-w-0">
            <p className="text-xs text-surface-400 mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{relativeTime(job.postedAt, t)}</span>
              {job.source && (
                <span className="inline-flex items-center gap-1">
                  · {t('source')}: {SOURCE_LABELS[job.source] || job.source}
                </span>
              )}
            </p>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-surface-900 dark:text-white leading-tight">
              {job.title}
            </h1>
            {job.company && (
              <p className="text-sm text-surface-500 dark:text-surface-400 mt-2">{job.company}</p>
            )}
          </div>
          <div className="flex-shrink-0 flex sm:flex-col items-center gap-3">
            {isApplied ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-xl px-4 py-2.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/>
                </svg>
                {t('applied')}
              </span>
            ) : user ? (
              <button onClick={() => setShowApply(true)} className="btn-primary text-sm cursor-pointer">
                {t('apply')}
              </button>
            ) : (
              <Link to="/login" className="btn-primary no-underline text-sm">{t('login_to_apply')}</Link>
            )}
          </div>
        </div>

        {/* Meta chips */}
        <div className="flex flex-wrap gap-2 mb-6">
          {job.location && (
            <span className="inline-flex items-center gap-1.5 text-xs bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300 rounded-full px-3 py-1.5">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
              {job.location}
            </span>
          )}
          {job.category && job.category !== 'Other' && (
            <span className="inline-flex items-center text-xs bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 rounded-full px-3 py-1.5 font-medium">
              {job.category}
            </span>
          )}
          {job.isRemote && (
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 rounded-full px-3 py-1.5">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="13,17 18,12 13,7"/><polyline points="6,17 11,12 6,7"/><polyline points="10,17 15,12 10,7"/>
              </svg>
              {t('remote')}
            </span>
          )}
          {job.jobType && (
            <span className="inline-flex items-center text-xs bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300 rounded-full px-3 py-1.5">
              {job.jobType}
            </span>
          )}
          {job.salary && (
            <span className="inline-flex items-center text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 rounded-full px-3 py-1.5 font-medium">
              {job.salary}
            </span>
          )}
        </div>

        {/* Contact / external */}
        {(job.contactEmail || (job.applyUrl && job.applyUrl !== job.sourceUrl)) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            {job.contactEmail && (
              <div className="bg-surface-50 dark:bg-surface-900/50 rounded-xl p-3.5">
                <p className="text-[11px] uppercase tracking-wide text-surface-400 mb-1">{t('contact')}</p>
                <a href={`mailto:${job.contactEmail}`} className="text-sm text-brand-600 dark:text-brand-400 no-underline hover:underline break-all">
                  {job.contactEmail}
                </a>
              </div>
            )}
            {job.applyUrl && job.applyUrl !== job.sourceUrl && (
              <div className="bg-surface-50 dark:bg-surface-900/50 rounded-xl p-3.5">
                <p className="text-[11px] uppercase tracking-wide text-surface-400 mb-1">{t('source')}</p>
                <a href={job.applyUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-brand-600 dark:text-brand-400 no-underline hover:underline break-all">
                  {new URL(job.applyUrl).hostname}
                </a>
              </div>
            )}
          </div>
        )}

        {/* Description */}
        <div>
          <h2 className="text-sm font-bold text-surface-900 dark:text-white uppercase tracking-wide mb-3">{t('about_role')}</h2>
          {job.description ? (
            <div className="text-sm text-surface-600 dark:text-surface-300 leading-relaxed whitespace-pre-wrap">
              {job.description}
            </div>
          ) : (
            <p className="text-sm text-surface-400">{t('no_jobs_desc')}</p>
          )}
        </div>

        {job.sourceUrl && (
          <p className="text-xs text-surface-400 mt-8 pt-4 border-t border-surface-100 dark:border-surface-700">
            {t('source')}:{' '}
            <a href={job.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-brand-600 dark:text-brand-400 no-underline hover:underline">
              {SOURCE_LABELS[job.source] || new URL(job.sourceUrl).hostname}
            </a>
          </p>
        )}
      </div>

      {showApply && user && (
        <ApplyModal
          job={job}
          applied={isApplied}
          onClose={() => setShowApply(false)}
          onApplied={handleApplied}
        />
      )}
    </div>
  );
}
