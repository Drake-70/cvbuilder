// Section guidance for zero-experience users
// Structural advice about section ordering — no content generation, no fabrication risk

exports.getStructureAdvice = (cvData) => {
  const sections = [];

  const hasEducation = cvData?.education && cvData.education.length > 0;
  const hasExperience = cvData?.experience && cvData.experience.length > 0;
  const hasNonTraditional = cvData?.nonTraditionalExperience && cvData.nonTraditionalExperience.length > 0;
  const hasSkills = cvData?.skills && cvData.skills.length >= 3;
  const hasSummary = cvData?.summary;
  const isStillStudying = cvData?.education?.[0]?.dates?.toLowerCase().includes('present') ||
    cvData?.education?.[0]?.dates?.toLowerCase().includes('encours');

  // Build ordered recommendations
  if (hasEducation) {
    const eduStrength = isStillStudying ? 'current studies' : 'formal qualification';
    sections.push({
      section: 'education',
      order: 1,
      reason: `Lead with Education — it's your strongest asset right now (${eduStrength}).`
    });
  }

  if (hasSkills && hasNonTraditional) {
    sections.push({
      section: 'skills',
      order: 2,
      reason: 'Showcase your Skills early — they demonstrate practical ability even without formal work history.'
    });
  }

  if (hasNonTraditional) {
    sections.push({
      section: 'projects',
      order: hasSkills ? 3 : 2,
      reason: 'Include Projects & Activities — volunteering, community work, and personal projects show initiative and transferable skills.'
    });
  }

  if (hasSkills && !hasNonTraditional) {
    sections.push({
      section: 'skills',
      order: hasEducation ? 2 : 1,
      reason: 'Your Skills section helps employers see your capabilities at a glance.'
    });
  }

  if (hasExperience) {
    sections.push({
      section: 'experience',
      order: sections.length + 1,
      reason: 'Include your work/internship experience — even short-term roles demonstrate real-world application.'
    });
  }

  // Always add these
  sections.push({
    section: 'summary',
    order: sections.length + 1,
    reason: 'Add a brief Professional Summary (2-3 lines) that states your career objective and key strengths.'
  });

  sections.push({
    section: 'languages',
    order: sections.length + 1,
    reason: 'List your languages — in Cameroon, being bilingual (French/English) is a significant asset.'
  });

  // Add section order numbers
  sections.sort((a, b) => a.order - b.order);
  sections.forEach((s, i) => { s.order = i + 1; });

  // Tips
  const tips = [];
  if (!hasExperience && !hasNonTraditional) {
    tips.push('Since you don\'t have work experience yet, consider adding school projects, church/community activities, or personal coding projects to fill this section.');
  }
  if (!hasSkills || cvData?.skills?.length < 3) {
    tips.push('Add more skills — think about soft skills (communication, teamwork) and tools you know how to use.');
  }
  if (!hasEducation) {
    tips.push('If you\'re still studying, mention your current program. Even incomplete education shows commitment to growth.');
  }

  return { sections, tips };
};
