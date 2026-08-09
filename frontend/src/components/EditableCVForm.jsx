import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const emptyExp = () => ({ title: '', company: '', dates: '', bullets: [] });
const emptyEdu = () => ({ degree: '', institution: '', dates: '', details: '' });

function cloneCv(cv) {
  const base = { ...cv };
  base.experience = (cv.experience || []).map((e) => ({ ...e, bullets: [...(e.bullets || [])] }));
  base.education = (cv.education || []).map((e) => ({ ...e }));
  base.skills = [...(cv.skills || [])];
  return base;
}

const inputClass = 'w-full rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 px-3 py-2 text-sm text-surface-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/40';
const labelClass = 'block text-xs font-semibold text-surface-500 dark:text-surface-400 mb-1';
const sectionTitleClass = 'text-xs font-bold text-brand-600 dark:text-brand-400 uppercase tracking-wider';

function Field({ label, value, onChange, textarea, placeholder, hint }) {
  return (
    <div>
      {label && <label className={labelClass}>{label}</label>}
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} placeholder={placeholder} className={inputClass} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputClass} />
      )}
      {hint && <p className="text-[11px] text-surface-400 mt-1">{hint}</p>}
    </div>
  );
}

export default function EditableCVForm({ cv, language = 'en', onSave, onCancel, saving, error }) {
  const { t } = useTranslation('common');
  const [draft, setDraft] = useState(() => cloneCv(cv || {}));

  const set = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));
  const setExp = (i, key, value) =>
    setDraft((prev) => {
      const experience = prev.experience.map((e, idx) => (idx === i ? { ...e, [key]: value } : e));
      return { ...prev, experience };
    });
  const setEdu = (i, key, value) =>
    setDraft((prev) => {
      const education = prev.education.map((e, idx) => (idx === i ? { ...e, [key]: value } : e));
      return { ...prev, education };
    });

  const removeExp = (i) => setDraft((prev) => ({ ...prev, experience: prev.experience.filter((_, idx) => idx !== i) }));
  const removeEdu = (i) => setDraft((prev) => ({ ...prev, education: prev.education.filter((_, idx) => idx !== i) }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const cleaned = {
      ...draft,
      experience: draft.experience.filter((exp) => exp.title || exp.company),
      education: draft.education.filter((edu) => edu.degree || edu.institution),
      skills: draft.skills.map((s) => s.trim()).filter(Boolean)
    };
    onSave(cleaned);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header */}
      <section className="space-y-3">
        <h3 className={sectionTitleClass}>{t('editor.contact_info')}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('editor.full_name')} value={draft.name || ''} onChange={(v) => set('name', v)} />
          <Field label={t('editor.headline')} value={draft.headline || ''} onChange={(v) => set('headline', v)} />
          <Field label={t('editor.email')} value={draft.email || ''} onChange={(v) => set('email', v)} />
          <Field label={t('editor.phone')} value={draft.phone || ''} onChange={(v) => set('phone', v)} />
          <Field label={t('editor.location')} value={draft.location || ''} onChange={(v) => set('location', v)} />
          <Field label={t('editor.linkedin')} value={draft.linkedin || ''} onChange={(v) => set('linkedin', v)} />
        </div>
        <Field label={t('editor.website')} value={draft.website || ''} onChange={(v) => set('website', v)} />
      </section>

      {/* Summary */}
      <section className="space-y-3">
        <h3 className={sectionTitleClass}>{t('editor.summary')}</h3>
        <Field textarea value={draft.summary || ''} onChange={(v) => set('summary', v)} />
      </section>

      {/* Skills */}
      <section className="space-y-3">
        <h3 className={sectionTitleClass}>{t('editor.skills')}</h3>
        <Field
          value={draft.skills.join(', ')}
          onChange={(v) => set('skills', v.split(','))}
          hint={t('editor.skills_hint')}
        />
      </section>

      {/* Experience */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className={sectionTitleClass}>{t('editor.experience')}</h3>
          <button
            type="button"
            onClick={() => setDraft((prev) => ({ ...prev, experience: [...prev.experience, emptyExp()] }))}
            className="text-xs font-medium text-brand-600 hover:text-brand-700 cursor-pointer"
          >
            + {t('editor.add_experience')}
          </button>
        </div>
        {draft.experience.length === 0 && (
          <p className="text-sm text-surface-400">{language === 'fr' ? 'Aucune expérience.' : 'No experience yet.'}</p>
        )}
        {draft.experience.map((exp, i) => (
          <div key={i} className="rounded-xl border border-surface-200 dark:border-surface-700 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-surface-400">#{i + 1}</span>
              <button type="button" onClick={() => removeExp(i)} className="text-xs font-medium text-rose-500 hover:text-rose-600 cursor-pointer">
                {t('editor.remove')}
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('editor.job_title')} value={exp.title || ''} onChange={(v) => setExp(i, 'title', v)} />
              <Field label={t('editor.company')} value={exp.company || ''} onChange={(v) => setExp(i, 'company', v)} />
            </div>
            <Field label={t('editor.dates')} value={exp.dates || ''} onChange={(v) => setExp(i, 'dates', v)} />
            <Field
              label={t('editor.bullets')}
              textarea
              value={(exp.bullets || []).join('\n')}
              onChange={(v) => setExp(i, 'bullets', v.split('\n').filter((b) => b.trim() !== ''))}
            />
          </div>
        ))}
      </section>

      {/* Education */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className={sectionTitleClass}>{t('editor.education')}</h3>
          <button
            type="button"
            onClick={() => setDraft((prev) => ({ ...prev, education: [...prev.education, emptyEdu()] }))}
            className="text-xs font-medium text-brand-600 hover:text-brand-700 cursor-pointer"
          >
            + {t('editor.add_education')}
          </button>
        </div>
        {draft.education.length === 0 && (
          <p className="text-sm text-surface-400">{language === 'fr' ? 'Aucune formation.' : 'No education yet.'}</p>
        )}
        {draft.education.map((edu, i) => (
          <div key={i} className="rounded-xl border border-surface-200 dark:border-surface-700 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-surface-400">#{i + 1}</span>
              <button type="button" onClick={() => removeEdu(i)} className="text-xs font-medium text-rose-500 hover:text-rose-600 cursor-pointer">
                {t('editor.remove')}
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('editor.degree')} value={edu.degree || ''} onChange={(v) => setEdu(i, 'degree', v)} />
              <Field label={t('editor.institution')} value={edu.institution || ''} onChange={(v) => setEdu(i, 'institution', v)} />
            </div>
            <Field label={t('editor.dates')} value={edu.dates || ''} onChange={(v) => setEdu(i, 'dates', v)} />
            <Field label={t('editor.details')} value={edu.details || ''} onChange={(v) => setEdu(i, 'details', v)} />
          </div>
        ))}
      </section>

      {error && <p className="text-sm text-rose-500">{error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={saving} className="btn-primary text-sm flex items-center gap-2">
          {saving && <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
          {t('save')}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost text-sm cursor-pointer">{t('cancel')}</button>
      </div>
    </form>
  );
}
