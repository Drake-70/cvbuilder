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

export default function ApplicationTracker({ documentId, currentStatus, currentCompany, onUpdate }) {
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

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <span className={`badge ${statusOption?.color || ''}`}>{statusOption?.label || status}</span>
        {company && <span className="text-xs text-surface-400">at {company}</span>}
        <button onClick={() => setEditing(true)} className="btn-ghost text-xs">
          {t('tailor.update', 'Update')}
        </button>
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
