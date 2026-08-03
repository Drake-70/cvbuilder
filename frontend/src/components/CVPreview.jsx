import { useTranslation } from 'react-i18next';
import { highlightText } from '../utils/gapKeywords';

export default function CVPreview({ cv, language = 'en', highlightTerms = [] }) {
  const { t } = useTranslation('tailor');
  if (!cv) return null;

  const isFr = language === 'fr';
  const hl = (text) => highlightText(text, highlightTerms, 'cv-hl-new');

  return (
    <div className="cv-preview-wrapper">
      <div className="cv-preview" role="document" aria-label={isFr ? 'Apercu du CV' : 'CV Preview'}>
        {/* Header */}
        <div className="cv-header">
          <h1 className="cv-name">{cv.name || 'Your Name'}</h1>
          {(cv.email || cv.phone || cv.location) && (
            <div className="cv-contact">
              {cv.email && <span>{cv.email}</span>}
              {cv.phone && <span>{cv.phone}</span>}
              {cv.location && <span>{cv.location}</span>}
            </div>
          )}
        </div>

        {/* Summary */}
        {cv.summary && (
          <div className="cv-section">
            <h2 className="cv-section-title">{isFr ? 'RESUME' : 'SUMMARY'}</h2>
            <p className="cv-text">{hl(cv.summary)}</p>
          </div>
        )}

        {/* Experience */}
        {cv.experience && cv.experience.length > 0 && (
          <div className="cv-section">
            <h2 className="cv-section-title">{isFr ? 'EXPERIENCE PROFESSIONNELLE' : 'EXPERIENCE'}</h2>
            {cv.experience.map((exp, i) => (
              <div key={i} className="cv-entry">
                <div className="cv-entry-header">
                  <div className="cv-entry-left">
                    <span className="cv-entry-title">{exp.title}</span>
                    {exp.company && <span className="cv-entry-company"> — {exp.company}</span>}
                  </div>
                  {exp.dates && <span className="cv-entry-dates">{exp.dates}</span>}
                </div>
                {exp.bullets && exp.bullets.length > 0 && (
                  <ul className="cv-bullets">
                    {exp.bullets.map((b, j) => (
                      <li key={j}>{hl(b)}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Education */}
        {cv.education && cv.education.length > 0 && (
          <div className="cv-section">
            <h2 className="cv-section-title">{isFr ? 'FORMATION' : 'EDUCATION'}</h2>
            {cv.education.map((edu, i) => (
              <div key={i} className="cv-entry">
                <div className="cv-entry-header">
                  <div className="cv-entry-left">
                    <span className="cv-entry-title">{edu.degree}</span>
                    {edu.institution && <span className="cv-entry-company"> — {edu.institution}</span>}
                  </div>
                  {edu.dates && <span className="cv-entry-dates">{edu.dates}</span>}
                </div>
                {edu.details && <p className="cv-text-sm">{hl(edu.details)}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Skills */}
        {cv.skills && cv.skills.length > 0 && (
          <div className="cv-section">
            <h2 className="cv-section-title">{isFr ? 'COMPETENCES' : 'SKILLS'}</h2>
            <div className="cv-skills">
              {cv.skills.map((skill, i) => (
                <span key={i} className="cv-skill-tag">{hl(skill)}</span>
              ))}
            </div>
          </div>
        )}

        {/* Additional Sections */}
        {cv.additionalSections && cv.additionalSections.length > 0 && (
          cv.additionalSections.map((sec, i) => (
            <div key={i} className="cv-section">
              <h2 className="cv-section-title">{sec.title?.toUpperCase()}</h2>
              <p className="cv-text">{hl(sec.content)}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
