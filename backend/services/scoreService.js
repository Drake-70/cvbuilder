// ATS / keyword alignment scoring function
// Derives a 0-100 score from the gap analysis and CV content
// No AI call needed — pure computation over existing tailoring output

exports.computeATSScore = (cvText, jobDescription, tailoredCV, gapAnalysis) => {
  const cvLower = (cvText || '').toLowerCase();
  const jdLower = (jobDescription || '').toLowerCase();

  if (!jdLower) return { score: 0, breakdown: {}, tips: ['Add a job description to get an ATS score.'] };

  // Extract keywords from job description (simple tokenization)
  const jdWords = extractKeywords(jdLower);
  const cvWords = new Set(cvLower.split(/\W+/).filter(w => w.length > 2));

  // 1. Keyword match score (40% weight)
  const matchedKeywords = jdWords.filter(w => cvWords.has(w));
  const keywordScore = jdWords.length > 0 ? Math.round((matchedKeywords.length / jdWords.length) * 100) : 0;

  // 2. Skills alignment (25% weight)
  const cvSkills = extractSkills(tailoredCV);
  const jdSkillMentions = extractSkillsFromJD(jdLower);
  const matchedSkills = cvSkills.filter(s => jdSkillMentions.some(j => s.toLowerCase().includes(j) || j.includes(s.toLowerCase())));
  const skillsScore = jdSkillMentions.length > 0
    ? Math.round((matchedSkills.length / jdSkillMentions.length) * 100)
    : (cvSkills.length > 0 ? 70 : 0);

  // 3. Gap penalty (20% weight) — fewer gaps = higher score
  const gapCount = (gapAnalysis || []).length;
  const gapScore = Math.max(0, 100 - (gapCount * 12));

  // 4. Structure score (15% weight) — has summary, experience bullets, education
  let structurePoints = 0;
  if (tailoredCV?.summary) structurePoints += 30;
  if (tailoredCV?.experience?.length > 0) structurePoints += 30;
  if (tailoredCV?.experience?.[0]?.bullets?.length >= 2) structurePoints += 15;
  if (tailoredCV?.education?.length > 0) structurePoints += 15;
  if (tailoredCV?.skills?.length >= 3) structurePoints += 10;

  // Weighted total
  const totalScore = Math.round(
    keywordScore * 0.40 +
    skillsScore * 0.25 +
    gapScore * 0.20 +
    structurePoints * 0.15
  );

  const score = Math.min(100, Math.max(0, totalScore));

  // Generate tips
  const tips = [];
  if (keywordScore < 50) tips.push('Include more keywords from the job description in your CV.');
  if (skillsScore < 60) tips.push('Highlight skills specifically mentioned in the job posting.');
  if (gapCount > 3) tips.push('Address the missing skills identified in the gap analysis.');
  if (!tailoredCV?.summary) tips.push('Add a professional summary tailored to this role.');
  if (tailoredCV?.experience?.[0]?.bullets?.length < 3) tips.push('Add more detail to your experience bullets.');

  return {
    score,
    breakdown: {
      keywords: keywordScore,
      skills: skillsScore,
      gaps: gapScore,
      structure: structurePoints
    },
    tips
  };
};

function extractKeywords(text) {
  // Common stop words to exclude
  const stopWords = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
    'her', 'was', 'one', 'our', 'out', 'has', 'his', 'how', 'its', 'may',
    'new', 'now', 'old', 'see', 'way', 'who', 'did', 'get', 'let', 'say',
    'she', 'too', 'use', 'with', 'that', 'this', 'will', 'each', 'make',
    'like', 'than', 'been', 'have', 'from', 'they', 'were', 'being',
    'would', 'could', 'should', 'about', 'into', 'just', 'also', 'more',
    'some', 'only', 'very', 'your', 'what', 'when', 'which', 'there',
    'their', 'these', 'those', 'other', 'such', 'most', 'over', 'after'
  ]);

  const words = text.split(/\W+/).filter(w => w.length > 2 && !stopWords.has(w));
  // Deduplicate while preserving order
  return [...new Set(words)];
}

function extractSkills(cv) {
  const skills = [...(cv?.skills || [])];
  // Also extract from experience bullets
  (cv?.experience || []).forEach(exp => {
    (exp?.bullets || []).forEach(bullet => {
      const words = bullet.toLowerCase().split(/[,;.\s]+/).filter(w => w.length > 3);
      words.forEach(w => {
        if (!skills.some(s => s.toLowerCase().includes(w))) {
          // Don't add noise — only add recognizable skill-like words
        }
      });
    });
  });
  return skills;
}

function extractSkillsFromJD(jdText) {
  const commonSkills = [
    'javascript', 'python', 'java', 'react', 'node', 'sql', 'html', 'css',
    'excel', 'word', 'powerpoint', 'microsoft office', 'google', 'sales',
    'marketing', 'communication', 'leadership', 'teamwork', 'management',
    'customer service', 'project management', 'data analysis', 'social media',
    'accounting', 'finance', 'hr', 'human resources', 'operations',
    'french', 'english', 'bilingual', 'writing', 'presentation',
    'problem solving', 'time management', 'organizational', 'planning',
    'microsoft', 'photoshop', 'illustrator', 'figma', 'design',
    'networking', 'linux', 'windows', 'database', 'crm', 'erp',
    'budgeting', 'procurement', 'logistics', 'inventory', 'quality',
    'teaching', 'training', 'mentoring', 'supervision', 'coordinating'
  ];

  return commonSkills.filter(skill => jdText.includes(skill));
}
