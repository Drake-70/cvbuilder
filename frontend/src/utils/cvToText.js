import { shouldSkillsFirst } from './cvLayout';

export default function cvToText(cv) {
  if (!cv) return '';
  const lines = [];

  if (cv.name) lines.push(cv.name);
  if (cv.headline) lines.push(cv.headline);
  const contact = [cv.email, cv.phone, cv.location, cv.linkedin, cv.website].filter(Boolean).join(' | ');
  if (contact) lines.push(contact);

  if (cv.summary) lines.push('', 'SUMMARY', '', cv.summary);

  const skills = Array.isArray(cv.skills) ? cv.skills : typeof cv.skills === 'string' ? [cv.skills] : [];
  const skillsFirst = shouldSkillsFirst(cv);
  const pushSkills = () => {
    if (skills.length > 0) lines.push('', 'SKILLS', '', skills.join(', '));
  };

  if (skillsFirst) pushSkills();

  if (Array.isArray(cv.experience) && cv.experience.length > 0) {
    lines.push('', 'EXPERIENCE');
    cv.experience.forEach((exp) => {
      const head = [exp.title, exp.company && `at ${exp.company}`].filter(Boolean).join(' ');
      const line = exp.dates ? `${head} (${exp.dates})` : head;
      if (line.trim()) lines.push('', line);
      if (Array.isArray(exp.bullets)) exp.bullets.forEach((b) => lines.push(`- ${b}`));
    });
  }

  if (Array.isArray(cv.education) && cv.education.length > 0) {
    lines.push('', 'EDUCATION');
    cv.education.forEach((edu) => {
      const head = [edu.degree, edu.institution && `at ${edu.institution}`].filter(Boolean).join(' ');
      const line = edu.dates ? `${head} (${edu.dates})` : head;
      if (line.trim()) lines.push('', line);
      if (edu.details) lines.push(edu.details);
    });
  }

  if (Array.isArray(cv.certifications) && cv.certifications.length > 0) {
    lines.push('', 'CERTIFICATIONS');
    cv.certifications.forEach((cert) => {
      const head = [cert.title, cert.issuer && `— ${cert.issuer}`].filter(Boolean).join(' ');
      const line = cert.year ? `${head} (${cert.year})` : head;
      if (line.trim()) lines.push(line);
    });
  }

  if (!skillsFirst) pushSkills();

  if (Array.isArray(cv.languages) && cv.languages.length > 0) {
    lines.push('', 'LANGUAGES', '', cv.languages.join(', '));
  }

  if (Array.isArray(cv.additionalSections)) {
    cv.additionalSections.forEach((sec) => {
      if (sec && (sec.title || sec.content)) {
        lines.push('', (sec.title || 'Additional').toUpperCase());
        if (sec.content) lines.push('', sec.content);
      }
    });
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
