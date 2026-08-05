import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { relativeTime } from '../utils/relativeTime';

export default function JobCard({ job, applied = false, index = 0 }) {
  const { t } = useTranslation('jobs');

  return (
    <Link
      to={`/jobs/${job._id}`}
      className="card p-5 no-underline hover:border-brand-300 dark:hover:border-brand-600 hover:shadow-lg transition-all animate-slide-up group block"
      style={{ animationDelay: `${index * 0.04}s` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-surface-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors leading-snug">
            {job.title}
          </p>
          {job.company && (
            <p className="text-xs text-surface-500 dark:text-surface-400 mt-1">{job.company}</p>
          )}
        </div>
        {applied && (
          <span className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-full px-2 py-0.5">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/>
            </svg>
            {t('applied')}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-3 text-xs text-surface-500 dark:text-surface-400">
        {job.location && (
          <span className="inline-flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
            {job.location}
          </span>
        )}
        {job.category && job.category !== 'Other' && (
          <span className="inline-flex items-center rounded-full bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 px-2 py-0.5 font-medium">
            {job.category}
          </span>
        )}
        {job.isRemote && (
          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="13,17 18,12 13,7"/><polyline points="6,17 11,12 6,7"/><polyline points="10,17 15,12 10,7"/>
            </svg>
            {t('remote')}
          </span>
        )}
        <span className="inline-flex items-center gap-1 ml-auto">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>
          </svg>
          {relativeTime(job.postedAt, t)}
        </span>
      </div>

      {job.description && (
        <p className="mt-3 text-sm text-surface-500 dark:text-surface-400 line-clamp-2 leading-relaxed">
          {job.description}
        </p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <span className="text-sm font-medium text-brand-600 dark:text-brand-400 inline-flex items-center gap-1">
          {t('view_details')}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:translate-x-0.5">
            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12,5 19,12 12,19"/>
          </svg>
        </span>
        {job.salary && (
          <span className="ml-auto text-xs font-medium text-emerald-600 dark:text-emerald-400">{job.salary}</span>
        )}
      </div>
    </Link>
  );
}
