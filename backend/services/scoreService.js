// ATS / keyword alignment scoring function
// Derives a 0-100 score from the gap analysis and CV content
// No AI call needed — pure computation over existing tailoring output

// Below this many distinct keywords a posting is not scored at all.
//
// A ratio over k keywords has a sampling error of roughly sqrt(p(1-p)/k): at 5
// keywords one match is worth 20% and the figure swings on wording alone. A job
// board is full of thin listings, and a badge reading 20% or 60% depending on how
// the ad was typed is worse than no badge -- it makes a judgement the data cannot
// support. The caller renders nothing instead.
const MIN_JOB_KEYWORDS = 12;

// Bound on the returned word lists. The counts are always exact; only the lists
// are capped, and `truncated` says so rather than letting a clipped list look
// like the whole one.
const MAX_LISTED_KEYWORDS = 60;

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
  const jdSkillMentions = knownSkillsIn(jdLower);
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

  const missingKeywords = jdWords.filter(w => !cvWords.has(w));

  return {
    score,
    breakdown: {
      keywords: keywordScore,
      skills: skillsScore,
      gaps: gapScore,
      structure: structurePoints
    },
    tips,
    keywords: {
      matched: matchedKeywords,
      missing: missingKeywords
    }
  };
};

function extractKeywords(text) {
  // Words that are never evidence. Split in two because they are never evidence
  // for different reasons, and the second group is the one that was a bug.
  //
  // Grammar and function words ("the", "and", "with") carry no signal.
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

  // Job-ad boilerplate. These words appear in almost every posting and describe
  // the transaction rather than the job, so no CV is penalised for lacking them
  // and none is rewarded for containing them. Before this was excluded, an
  // excellent match scored 49% purely because the ad said "hiring", "join",
  // "team", "salary" and "negotiable" -- a number describing the advertisement,
  // not the candidate.
  //
  // The list is deliberately kept: a CV's own phrasing still contributes, and
  // what is removed is exactly the vocabulary that cannot separate two
  // candidates. Terms that discriminate ("kubernetes", "mentor", "review",
  // "optimisation") stay.
  const adBoilerplate = [
    'hire', 'hiring', 'hires', 'join', 'joining', 'work', 'works', 'working',
    'help', 'helps', 'helping', 'want', 'wants', 'need', 'needs', 'needed',
    'looking', 'role', 'roles', 'candidate', 'candidates', 'person', 'people',
    'someone', 'anyone', 'good', 'great', 'strong', 'excellent', 'plus',
    'own', 'well', 'better', 'able', 'across', 'within', 'using', 'used',
    'offer', 'offers', 'salary', 'negotiable', 'depending', 'please', 'apply',
    'send', 'email', 'experience', 'experienced', 'skills', 'skill', 'qualified',
    'qualification', 'knowledge', 'understanding', 'familiarity', 'ability',
    'ideally', 'preferably', 'minimum', 'required', 'requirement', 'requirements',
    'duties', 'responsibilities', 'day', 'days', 'week', 'weeks', 'month',
    'months', 'year', 'years', 'time', 'full', 'part', 'team', 'teams',
    'company', 'companies', 'position', 'positions', 'job', 'jobs', 'etc',
    'cv', 'resume', 'please', 'salary', 'package'
  ];

  const stop = new Set([...stopWords, ...adBoilerplate]);
  const words = text.split(/\W+/).filter(w => w.length > 2 && !stop.has(w));
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

// Which of the known skills this text names. Renamed from `extractSkillsFromJD`
// because it is now asked about CV text as well: the job board scores two plain
// documents against each other, and both sides answer the same question.
function knownSkillsIn(text) {
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
    'teaching', 'training', 'mentoring', 'supervision', 'coordinating',
    // Matching is substring-based, so entries are chosen to be long enough that
    // they cannot fire inside an unrelated word. That rules out 'git' (digital),
    // 'aws' (laws) and 'rest' (interest) -- all real skills, none safe to match
    // this way. 'sql' above does fire inside 'postgresql', which is correct.
    'typescript', 'docker', 'kubernetes', 'devops', 'github',
    'postgresql', 'mysql', 'mongodb', 'redis', 'graphql', 'api',
    'agile', 'scrum', 'kanban', 'seo', 'copywriting', 'indesign',
    'bookkeeping', 'payroll', 'reconciliation', 'audit', 'compliance',
    'quickbooks', 'salesforce', 'hubspot', 'zendesk', 'odoo', 'shopify',
    'supply chain'
  ];

  return commonSkills.filter(skill => text.includes(skill));
}

/**
 * Vocabulary alignment between a saved CV and a job posting.
 *
 * Deliberately not `computeATSScore`. Two of its four sub-scores cannot be known
 * here: `structure` reads a tailored CV object and `gaps` reads a gap analysis,
 * and on the job board neither exists -- no tailoring has happened yet. Passing
 * nulls scores structure 0 and gaps 100 for every user, so the badge would mostly
 * measure that the board is not the tailoring flow, dragging every score down by
 * a flat 15 and inflating it by a flat 20.
 *
 * So this scores the one thing both documents can answer: do they talk about the
 * same things. Keywords carry 60% and skills 40% -- more weight on skills than
 * the ATS score gives them, because on a job board a named tool is the signal and
 * generic vocabulary is the noise.
 *
 * When the posting names no known skill, skills are dropped from the score
 * entirely rather than defaulted to a constant. A placeholder number in the
 * breakdown would be read as a measurement.
 */
exports.computeJobMatchScore = (cvText, jobDescription) => {
  const cvLower = (cvText || '').toLowerCase();
  const jdLower = (jobDescription || '').toLowerCase();

  const jdWords = extractKeywords(jdLower);
  const cvWords = new Set(cvLower.split(/\W+/).filter(w => w.length > 2));

  const matchedKeywords = jdWords.filter(w => cvWords.has(w));
  const missingKeywords = jdWords.filter(w => !cvWords.has(w));

  const base = {
    score: null,
    insufficient: true,
    breakdown: { keywords: null, skills: null },
    keywords: { matched: [], missing: [], truncated: false },
    matchedSkills: [],
    counts: {
      jdKeywords: jdWords.length,
      matchedKeywords: matchedKeywords.length,
      cvKeywords: cvWords.size,
      jdSkills: 0,
      matchedSkills: 0
    }
  };

  if (jdWords.length < MIN_JOB_KEYWORDS) return base;

  const keywordScore = Math.round((matchedKeywords.length / jdWords.length) * 100);

  const jdSkills = knownSkillsIn(jdLower);
  const cvSkills = knownSkillsIn(cvLower);
  const matchedSkills = jdSkills.filter(j => cvSkills.some(c => c.includes(j) || j.includes(c)));

  const skillsScore = jdSkills.length
    ? Math.round((matchedSkills.length / jdSkills.length) * 100)
    : null;

  const score = skillsScore === null
    ? keywordScore
    : Math.round(keywordScore * 0.6 + skillsScore * 0.4);

  const truncated = matchedKeywords.length + missingKeywords.length > MAX_LISTED_KEYWORDS;

  return {
    score: Math.min(100, Math.max(0, score)),
    insufficient: false,
    breakdown: { keywords: keywordScore, skills: skillsScore },
    keywords: {
      matched: matchedKeywords.slice(0, MAX_LISTED_KEYWORDS),
      missing: missingKeywords.slice(0, MAX_LISTED_KEYWORDS),
      truncated
    },
    matchedSkills,
    counts: {
      jdKeywords: jdWords.length,
      matchedKeywords: matchedKeywords.length,
      cvKeywords: cvWords.size,
      jdSkills: jdSkills.length,
      matchedSkills: matchedSkills.length
    }
  };
};

exports.MIN_JOB_KEYWORDS = MIN_JOB_KEYWORDS;
exports.MAX_LISTED_KEYWORDS = MAX_LISTED_KEYWORDS;
