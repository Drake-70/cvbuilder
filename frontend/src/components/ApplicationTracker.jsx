import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft', color: 'bg-surface-200 text-surface-600' },
  { value: 'applied', label: 'Applied', color: 'bg-brand-100 text-brand-700' },
  { value: 'interviewed', label: 'Interview', color: 'bg-amber-50 text-amber-500' },
  { value: 'offered', label: 'Offered', color: 'bg-emerald-50 text-emerald-500' },
  { value: 'rejected', label: 'Rejected', color: 'bg-rose-50 text-rose-500' },
  { value: 'withdrawn', label: 'Withdrawn', color: 'bg-surface-200 text-surface-500' }
];

export default function ApplicationTracker({ documentId, currentStatus, currentCompany, currentAppliedAt, onUpdate }) {
  const { t } = useTranslation();
  if (!documentId) return null;
  const [status, setStatus] = useState(currentStatus || 'draft');
  const [company, setCompany] = useState(currentCompany || '');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.patch(`/document/${documentId}/status`, {
        applicationStatus: status,
        companyApplied: company
      });
      onUpdate?.(res.data);
      setEditing(false);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  const statusOption = STATUS_OPTIONS.find(s => s.value === status);

  const needsFollowUp = status === 'applied' && currentAppliedAt && (Date.now() - new Date(currentAppliedAt).getTime()) > 7 * 24 * 60 * 60 * 1000;

  const daysSinceApplied = currentAppliedAt
    ? Math.floor((Date.now() - new Date(currentAppliedAt).getTime()) / (24 * 60 * 60 * 1000))
    : 0;

  const followUpOnWhatsApp = () => {
    const subject = company || t('tracker.opportunity', 'this opportunity');
    const date = currentAppliedAt ? new Date(currentAppliedAt).toLocaleDateString() : '';
    const msg = t('tracker.whatsappFollowUp', 'Hello! I applied for the position at {{company}} on {{date}} and wanted to follow up on the status of my application. Thank you!', {
      company: subject,
      date
    });
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
  };

  if (!editing) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className={`badge ${statusOption?.color || ''}`}>{statusOption?.label || status}</span>
          {company && <span className="text-xs text-surface-400">at {company}</span>}
          <button onClick={() => setEditing(true)} className="btn-ghost text-xs">
            {t('tailor.update', 'Update')}
          </button>
        </div>
        {needsFollowUp && (
          <div className="flex flex-wrap items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-lg px-3 py-2 animate-scale-in">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500 flex-shrink-0">
              <circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>
            </svg>
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {t('tracker.followUpHint', `It's been {{days}} days since you applied. A polite follow-up can boost your chances.`, { days: daysSinceApplied })}
            </p>
            <button onClick={followUpOnWhatsApp} className="btn-ghost text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              {t('tracker.followUpWhatsApp', 'Send follow-up')}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-surface-50 rounded-xl p-3.5 space-y-3 animate-scale-in">
      <div>
        <label htmlFor="tracker-company" className="text-xs font-medium text-surface-500 mb-1 block">{t('tailor.company', 'Company')}</label>
        <input
          id="tracker-company"
          type="text"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder={t('tailor.companyPlaceholder', 'e.g. MTN Cameroon')}
          className="input-field text-sm py-2"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-surface-500 mb-1.5 block">{t('tailor.status', 'Status')}</label>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setStatus(opt.value)}
              className={`badge cursor-pointer transition-all ${
                status === opt.value ? `${opt.color} ring-2 ring-offset-1 ring-brand-300` : 'bg-surface-100 text-surface-400 hover:bg-surface-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <button onClick={() => setEditing(false)} className="btn-ghost text-xs">{t('common.cancel', 'Cancel')}</button>
        <button onClick={save} disabled={saving} className="btn-primary text-xs py-1.5 px-4">
          {saving ? '...' : t('common.save', 'Save')}
        </button>
      </div>
    </div>
  );
}
