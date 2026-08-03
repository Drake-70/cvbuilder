import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import SectionGuidance from './SectionGuidance';

export default function BuildStep({ onComplete, onBack, language, user }) {
  const { t } = useTranslation('tailor');
  const { t: tCommon } = useTranslation('common');
  const lang = language || 'en';
  const [subStep, setSubStep] = useState(0);
  const [loading, setLoading] = useState(false);

  const [personalInfo, setPersonalInfo] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    location: user?.location || '',
    targetRole: user?.jobTitle || ''
  });
  const [education, setEducation] = useState([]);
  const [experience, setExperience] = useState([]);
  const [nonTraditional, setNonTraditional] = useState([]);
  const [selectedSkills, setSelectedSkills] = useState([]);
  const [customSkillInput, setCustomSkillInput] = useState('');
  const [skillOptions, setSkillOptions] = useState([]);
  const [noEducation, setNoEducation] = useState(false);
  const [noExperience, setNoExperience] = useState(false);
  const [expandingBullets, setExpandingBullets] = useState(false);
  const [savedSkills, setSavedSkills] = useState([]);
  const [savedSkillsLoaded, setSavedSkillsLoaded] = useState(false);
  const skillsInitialized = useRef(false);

  useEffect(() => {
    let active = true;
    api.get('/auth/me')
      .then((res) => {
        if (!active) return;
        const skills = Array.isArray(res.data?.user?.savedSkills) ? res.data.user.savedSkills : [];
        setSavedSkills(skills);
      })
      .catch(() => {})
      .finally(() => { if (active) setSavedSkillsLoaded(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (subStep === 4 && savedSkillsLoaded && !skillsInitialized.current) {
      skillsInitialized.current = true;
      setSelectedSkills(prev => {
        const next = [...prev];
        savedSkills.forEach((s) => {
          if (!next.some(x => x.toLowerCase() === s.toLowerCase())) next.push(s);
        });
        return next;
      });
    }
  }, [subStep, savedSkillsLoaded, savedSkills]);

  useEffect(() => {
    if (subStep === 4 && personalInfo.targetRole && skillOptions.length === 0) {
      api.get(`/cv/skills?jobTitle=${encodeURIComponent(personalInfo.targetRole)}`)
        .then(res => setSkillOptions(res.data.skills || []))
        .catch(() => {});
    }
  }, [subStep, personalInfo.targetRole]);

  const fallbackSkills = lang === 'fr'
    ? ['Communication', 'Travail d\'équipe', 'Leadership', 'Résolution de problèmes', 'Gestion du temps', 'Informatique', 'Microsoft Office', 'Service client', 'Gestion de projet', 'Analyse de données', 'Réseaux sociaux', 'Français', 'Anglais', 'Rédaction', 'Attention aux détails', 'Adaptabilité', 'Fiabilité', 'Bilingue (français/anglais)', 'Email', 'Excel', 'Recherche sur Internet', 'Comptabilité de base', 'Écoute active', 'Gestion des conflits', 'Multitâches', 'Prise de parole en public', 'Planification d\'événements', 'Budgetisation', 'Tenue de livres', 'Google Docs', 'PowerPoint']
    : ['Communication', 'Teamwork', 'Leadership', 'Problem Solving', 'Time Management', 'Computer Literacy', 'Microsoft Office', 'Customer Service', 'Project Management', 'Data Analysis', 'Social Media', 'French', 'English', 'Writing', 'Attention to Detail', 'Adaptability', 'Reliability', 'Bilingual (English/French)', 'Email', 'Excel', 'Internet Research', 'Basic Accounting', 'Active Listening', 'Conflict Resolution', 'Multi-tasking', 'Public Speaking', 'Event Planning', 'Budgeting', 'Bookkeeping', 'Google Docs', 'PowerPoint'];

  const displaySkills = (() => {
    const base = skillOptions.length > 0 ? skillOptions : fallbackSkills;
    const merged = [...base];
    savedSkills.forEach((s) => {
      if (!merged.some(x => x.toLowerCase() === s.toLowerCase())) merged.unshift(s);
    });
    return merged;
  })();

  const steps = [
    { label: t('personal_info'), icon: '01' },
    { label: t('education'), icon: '02' },
    { label: t('experience'), icon: '03' },
    { label: t('non_traditional'), icon: '04' },
    { label: t('skills'), icon: '05' }
  ];

  const addEducation = () => setEducation([...education, { institution: '', degree: '', dates: '', details: '' }]);
  const updateEducation = (i, field, val) => { const u = [...education]; u[i][field] = val; setEducation(u); };
  const removeEducation = (i) => setEducation(education.filter((_, idx) => idx !== i));

  const addExperience = () => setExperience([...experience, { title: '', company: '', dates: '', description: '' }]);
  const updateExperience = (i, field, val) => { const u = [...experience]; u[i][field] = val; setExperience(u); };
  const removeExperience = (i) => setExperience(experience.filter((_, idx) => idx !== i));

  const addNonTraditional = () => setNonTraditional([...nonTraditional, '']);
  const updateNonTraditional = (i, val) => { const u = [...nonTraditional]; u[i] = val; setNonTraditional(u); };
  const removeNonTraditional = (i) => setNonTraditional(nonTraditional.filter((_, idx) => idx !== i));

  const toggleSkill = (s) => setSelectedSkills(prev => {
    const existing = prev.find(x => x.toLowerCase() === s.toLowerCase());
    if (existing) return prev.filter(x => x.toLowerCase() !== s.toLowerCase());
    return [...prev, s];
  });

  const handleExpandBullets = async () => {
    const items = nonTraditional.filter(n => n.trim());
    if (items.length === 0) return;
    setExpandingBullets(true);
    try {
      const res = await api.post('/cv/expand-bullets', { items, language: lang });
      if (res.data?.nonTraditionalExperience) {
        setNonTraditional(res.data.nonTraditionalExperience);
      }
    } catch {
      // silent — user can retry
    } finally {
      setExpandingBullets(false);
    }
  };

  const addCustomSkill = () => {
    const v = customSkillInput.trim();
    if (v && !selectedSkills.includes(v)) { setSelectedSkills([...selectedSkills, v]); setCustomSkillInput(''); }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const res = await api.post('/cv/build', {
        personalInfo,
        education: noEducation ? [] : education.filter(e => e.institution || e.degree),
        experience: noExperience ? [] : experience.filter(e => e.title || e.description),
        nonTraditionalExperience: nonTraditional.filter(n => n.trim()),
        skills: selectedSkills,
        language: lang
      });
      const expanded = {
        ...res.data,
        name: res.data.name || personalInfo.name,
        email: res.data.email || personalInfo.email,
        phone: res.data.phone || personalInfo.phone,
        location: res.data.location || personalInfo.location
      };
      onComplete(JSON.stringify(expanded), 'build', expanded);
      if (user) {
        api.patch('/auth/me', { savedSkills: selectedSkills }).catch(() => {});
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to build CV.');
    } finally {
      setLoading(false);
    }
  };

  const canProceed = subStep === 0 ? personalInfo.name.trim().length > 0 : true;

  return (
    <div>
      <button onClick={onBack} className="btn-ghost mb-4 -ml-2">
        <svg className="w-4 h-4 mr-1 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12,19 5,12 12,5"/>
        </svg>
        {tCommon('back')}
      </button>

      <h2 className="text-2xl font-bold text-surface-900 mb-6">{t('build_cv')}</h2>

      {/* Step progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-surface-400">{t('questionnaire_step', { current: subStep + 1, total: steps.length })}</span>
          <span className="text-xs font-semibold text-brand-600">{steps[subStep].label}</span>
        </div>
        <div className="flex gap-1.5">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                i < subStep ? 'bg-brand-500' : i === subStep ? 'bg-brand-400' : 'bg-surface-200'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="card p-5 sm:p-6" key={subStep}>
        {subStep === 0 && (
          <div className="space-y-4">
            <p className="text-sm text-surface-500 mb-2">{t('personal_info_hint')}</p>
            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-surface-700 mb-1.5">{t('full_name')} *</label>
              <input id="fullName" type="text" required value={personalInfo.name} onChange={(e) => setPersonalInfo({ ...personalInfo, name: e.target.value })} className="input-field" placeholder={lang === 'fr' ? 'Votre nom complet' : 'Your full name'} />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-surface-700 mb-1.5">{t('email_label')}</label>
              <input id="email" type="email" value={personalInfo.email} onChange={(e) => setPersonalInfo({ ...personalInfo, email: e.target.value })} className="input-field" placeholder="you@example.com" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-surface-700 mb-1.5">{t('phone')}</label>
                <input id="phone" type="tel" value={personalInfo.phone} onChange={(e) => setPersonalInfo({ ...personalInfo, phone: e.target.value })} className="input-field" placeholder="+237 ..." />
              </div>
              <div>
                <label htmlFor="location" className="block text-sm font-medium text-surface-700 mb-1.5">{t('location')}</label>
                <input id="location" type="text" value={personalInfo.location} onChange={(e) => setPersonalInfo({ ...personalInfo, location: e.target.value })} className="input-field" placeholder={lang === 'fr' ? 'Douala, Cameroun' : 'Douala, Cameroon'} />
              </div>
            </div>
            <div>
              <label htmlFor="targetRole" className="block text-sm font-medium text-surface-700 mb-1.5">{t('target_role')}</label>
              <input id="targetRole" type="text" value={personalInfo.targetRole} onChange={(e) => setPersonalInfo({ ...personalInfo, targetRole: e.target.value })} className="input-field" placeholder={lang === 'fr' ? 'ex: Agent de service client' : 'e.g. Customer Service Rep'} />
            </div>
          </div>
        )}

        {subStep === 1 && (
          <div className="space-y-4">
            <label className="flex items-center gap-2.5 cursor-pointer p-3 rounded-xl hover:bg-surface-50 transition-colors">
              <input type="checkbox" checked={noEducation} onChange={(e) => setNoEducation(e.target.checked)} className="w-4 h-4 rounded border-surface-300 text-brand-600 accent-brand-600" />
              <span className="text-sm text-surface-600">{t('no_formal_education')}</span>
            </label>

            {!noEducation && education.map((edu, i) => (
              <div key={i} className="border border-surface-200 rounded-xl p-4 space-y-3 animate-slide-up">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-surface-700">{t('education')} {i + 1}</span>
                  <button onClick={() => removeEducation(i)} className="text-surface-400 hover:text-rose-500 text-xs cursor-pointer transition-colors">&times; {t('remove')}</button>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor={`edu-institution-${i}`} className="sr-only">{t('institution')}</label>
                    <input id={`edu-institution-${i}`} type="text" placeholder={t('institution')} value={edu.institution} onChange={(e) => updateEducation(i, 'institution', e.target.value)} className="input-field" />
                  </div>
                  <div>
                    <label htmlFor={`edu-degree-${i}`} className="sr-only">{t('degree')}</label>
                    <input id={`edu-degree-${i}`} type="text" placeholder={t('degree')} value={edu.degree} onChange={(e) => updateEducation(i, 'degree', e.target.value)} className="input-field" />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor={`edu-dates-${i}`} className="sr-only">{t('edu_dates')}</label>
                    <input id={`edu-dates-${i}`} type="text" placeholder={t('edu_dates')} value={edu.dates} onChange={(e) => updateEducation(i, 'dates', e.target.value)} className="input-field" />
                  </div>
                  <div>
                    <label htmlFor={`edu-details-${i}`} className="sr-only">{t('edu_details')}</label>
                    <input id={`edu-details-${i}`} type="text" placeholder={t('edu_details')} value={edu.details} onChange={(e) => updateEducation(i, 'details', e.target.value)} className="input-field" />
                  </div>
                </div>
              </div>
            ))}

            {!noEducation && (
              <button onClick={addEducation} className="w-full border-2 border-dashed border-surface-200 rounded-xl py-3 text-sm font-medium text-surface-500 hover:border-brand-300 hover:text-brand-600 hover:bg-brand-50/30 cursor-pointer transition-all">
                + {t('add_education')}
              </button>
            )}
          </div>
        )}

        {subStep === 2 && (
          <div className="space-y-4">
            <label className="flex items-center gap-2.5 cursor-pointer p-3 rounded-xl hover:bg-surface-50 transition-colors">
              <input type="checkbox" checked={noExperience} onChange={(e) => setNoExperience(e.target.checked)} className="w-4 h-4 rounded border-surface-300 text-brand-600 accent-brand-600" />
              <span className="text-sm text-surface-600">{t('has_no_experience')}</span>
            </label>

            {!noExperience && experience.map((exp, i) => (
              <div key={i} className="border border-surface-200 rounded-xl p-4 space-y-3 animate-slide-up">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-surface-700">{t('experience')} {i + 1}</span>
                  <button onClick={() => removeExperience(i)} className="text-surface-400 hover:text-rose-500 text-xs cursor-pointer transition-colors">&times; {t('remove')}</button>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor={`exp-title-${i}`} className="sr-only">{t('job_title')}</label>
                    <input id={`exp-title-${i}`} type="text" placeholder={t('job_title')} value={exp.title} onChange={(e) => updateExperience(i, 'title', e.target.value)} className="input-field" />
                  </div>
                  <div>
                    <label htmlFor={`exp-company-${i}`} className="sr-only">{t('company')}</label>
                    <input id={`exp-company-${i}`} type="text" placeholder={t('company')} value={exp.company} onChange={(e) => updateExperience(i, 'company', e.target.value)} className="input-field" />
                  </div>
                </div>
                <div>
                  <label htmlFor={`exp-dates-${i}`} className="sr-only">{t('exp_dates')}</label>
                  <input id={`exp-dates-${i}`} type="text" placeholder={t('exp_dates')} value={exp.dates} onChange={(e) => updateExperience(i, 'dates', e.target.value)} className="input-field" />
                </div>
                <div>
                  <label htmlFor={`exp-desc-${i}`} className="sr-only">{t('exp_description')}</label>
                  <textarea id={`exp-desc-${i}`} placeholder={t('exp_description')} value={exp.description} onChange={(e) => updateExperience(i, 'description', e.target.value)} rows={3} className="input-field resize-y" />
                </div>
              </div>
            ))}

            {!noExperience && (
              <button onClick={addExperience} className="w-full border-2 border-dashed border-surface-200 rounded-xl py-3 text-sm font-medium text-surface-500 hover:border-brand-300 hover:text-brand-600 hover:bg-brand-50/30 cursor-pointer transition-all">
                + {t('add_experience')}
              </button>
            )}
          </div>
        )}

        {subStep === 3 && (
          <div className="space-y-4">
            <div className="bg-brand-50/50 border border-brand-100 rounded-xl p-3.5">
              <p className="text-sm text-brand-800">{t('non_traditional_hint')}</p>
            </div>

            {nonTraditional.map((item, i) => (
              <div key={i} className="flex gap-2 animate-slide-up">
                <textarea value={item} onChange={(e) => updateNonTraditional(i, e.target.value)} placeholder={t('activity_description')} rows={2} className="input-field resize-y flex-1" />
                <button onClick={() => removeNonTraditional(i)} className="text-surface-400 hover:text-rose-500 cursor-pointer self-start mt-2.5 transition-colors">&times;</button>
              </div>
            ))}

            <button onClick={addNonTraditional} className="w-full border-2 border-dashed border-surface-200 rounded-xl py-3 text-sm font-medium text-surface-500 hover:border-brand-300 hover:text-brand-600 hover:bg-brand-50/30 cursor-pointer transition-all">
              + {t('add_activity')}
            </button>

            {nonTraditional.filter(n => n.trim()).length > 0 && (
              <button
                onClick={handleExpandBullets}
                disabled={expandingBullets}
                className="w-full border border-brand-200 bg-brand-50/50 rounded-xl py-3 text-sm font-medium text-brand-700 hover:bg-brand-100/50 cursor-pointer transition-all flex items-center justify-center gap-2"
              >
                {expandingBullets ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    {tCommon('loading')}
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="13,2 3,14 12,14 11,22 21,10 12,10 13,2"/>
                    </svg>
                    {t('expand_bullets')}
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {subStep === 4 && (
          <div className="space-y-4">
            <p className="text-sm text-surface-500">{t('skills_hint')}</p>

            <div className="flex flex-wrap gap-2">
              {displaySkills.map((skill) => (
                <button
                  key={skill}
                  onClick={() => toggleSkill(skill)}
                  className={`px-3 py-1.5 rounded-full text-sm border cursor-pointer transition-all duration-200 ${
                    selectedSkills.includes(skill)
                      ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                      : 'bg-surface-0 text-surface-600 border-surface-200 hover:border-brand-300 hover:text-brand-600'
                  }`}
                >
                  {selectedSkills.includes(skill) && <svg className="w-3 h-3 mr-1 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20,6 9,17 4,12"/></svg>}
                  {skill}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <label htmlFor="customSkillInput" className="sr-only">{t('add_custom_skill')}</label>
                <input id="customSkillInput" type="text" value={customSkillInput} onChange={(e) => setCustomSkillInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomSkill())} placeholder={t('add_custom_skill')} className="input-field" />
              </div>
              <button onClick={addCustomSkill} disabled={!customSkillInput.trim()} className="btn-primary !px-4">+</button>
            </div>

            {selectedSkills.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-surface-400">{t('selected_count', { count: selectedSkills.length })}</span>
                <button onClick={() => setSelectedSkills([])} className="text-xs text-surface-400 hover:text-rose-500 cursor-pointer">{t('clear_all')}</button>
              </div>
            )}

            {/* Section Guidance */}
            <div className="mt-4">
              <SectionGuidance cvData={{
                personalInfo,
                education: noEducation ? [] : education.filter(e => e.institution || e.degree),
                experience: noExperience ? [] : experience.filter(e => e.title || e.description),
                nonTraditionalExperience: nonTraditional.filter(n => n.trim()),
                skills: selectedSkills
              }} />
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between mt-6">
        <button
          onClick={() => subStep > 0 ? setSubStep(subStep - 1) : onBack()}
          className="btn-secondary"
        >
          <svg className="w-4 h-4 mr-1 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12,19 5,12 12,5"/>
          </svg>
          {tCommon('back')}
        </button>

        {subStep < steps.length - 1 ? (
          <button onClick={() => setSubStep(subStep + 1)} disabled={!canProceed} className="btn-primary">
            {tCommon('next')}
            <svg className="w-4 h-4 ml-1 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12,5 19,12 12,19"/>
            </svg>
          </button>
        ) : (
          <button onClick={handleSubmit} disabled={loading} className="btn-primary flex items-center gap-2">
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                {tCommon('loading')}
              </>
            ) : (
              <>
                {tCommon('submit')}
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20,6 9,17 4,12"/>
                </svg>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
