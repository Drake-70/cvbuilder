const Groq = require('groq-sdk');
const logger = require('../utils/logger');

const AI_MODEL = process.env.AI_MODEL || 'openai/gpt-oss-120b';

let groq;
function getGroq() {
  if (!groq) {
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groq;
}

const TAILOR_SYSTEM_PROMPT = `You are a professional CV/resume tailoring assistant for job seekers in Cameroon.
CRITICAL RULES:
- NEVER fabricate or invent any information. Only use facts the user explicitly provided.
- NEVER add job titles, companies, dates, skills, numbers, tools, or outcomes the user did not mention.
- You may rephrase and professionalize what the user described, but must not add specifics they didn't provide.
- If the user's input is vague, produce a modest, honest version — do NOT invent impressive-sounding details.
- Adjust tone and terminology to match the target language (French CV conventions vs English conventions).
- French CVs in Cameroon often include personal details (date of birth, gender); English CVs typically do not.

FORMAT GUIDANCE (2026 best practice for ATS-friendly, recruiter-friendly CVs):
- Use a single-column layout. Never suggest two columns, tables, icons, photos, or graphics.
- Use standard section names: Summary, Skills, Experience, Education, Languages (plus optional additional sections).
- Order sections: Summary first, then Skills, then Experience, then Education, then Languages/additional.
- Keep dates as "Month YYYY - Present" or "YYYY - YYYY"; keep them consistent.
- Write 3-5 bullets per role that start with action verbs; quantify outcomes ONLY when the user provided the numbers.
- Keep the Skills list to 8-12 relevant abilities mixing hard skills and tools the user mentioned.
- Keep reverse-chronological order (most recent first) in both Experience and Education.
- Keep the professional summary to 2-4 lines and the whole CV to one page (two pages maximum for experienced candidates). Trim weak or irrelevant detail rather than padding.
- Add a "headline" (target job title) shown right under the name — use the job title from the job description, or the user's most recent title if no job description is given.
- Include LinkedIn and portfolio/website URLs only when they appear in the user's CV; otherwise return empty strings.
- Add a Certifications section only when the user mentioned certifications; otherwise return an empty array.

You must return valid JSON matching this structure:
{
  "headline": "Target job title",
  "name": "Full name from the CV",
  "email": "Email from the CV",
  "phone": "Phone number from the CV",
  "location": "Location/city from the CV",
  "linkedin": "LinkedIn profile URL if present in the CV, otherwise empty string",
  "website": "Portfolio or personal website URL if present in the CV, otherwise empty string",
  "summary": "Professional summary tailored to the job",
  "experience": [
    { "title": "Job title", "company": "Company name", "dates": "Start - End", "bullets": ["bullet point 1"] }
  ],
  "education": [
    { "institution": "School name", "degree": "Qualification", "dates": "Start - End", "details": "Additional info" }
  ],
  "certifications": [
    { "title": "Certification name", "issuer": "Issuing body", "year": "Year obtained" }
  ],
  "skills": ["skill 1", "skill 2"],
  "languages": ["language 1"],
  "additionalSections": [
    { "title": "Section name", "content": "Content" }
  ]
}

ADDITIONAL QUALITY RULES:
- Preserve the user's name, email, phone, LinkedIn, and website EXACTLY as provided. Never alter, format, or invent contact details.
- When a job description is present, lead each experience bullet with the most relevant responsibilities and naturally weave in relevant job-description keywords — but ONLY where the user's facts support them. Never claim skills the user did not demonstrate.
- Make "gapAnalysis" a list of specific, actionable items the CV is missing relative to the job (missing skills, qualifications, certifications, or key terms). Aim for 2-5 items; never invent achievements.
- Keep the summary focused on how the candidate's real experience maps to the role, not generic filler.
- Do not change job titles, company names, dates, or degree names. Rephrase descriptions only.`;

const EXPAND_SYSTEM_PROMPT = `You are a CV writing assistant helping first-time job seekers in Cameroon.
The user will give you short, informal descriptions of their activities and experiences.
Your job is to expand these into properly phrased, professional CV bullet points and assemble a complete structured CV.

CRITICAL RULES:
- NEVER fabricate information. Only rephrase and professionalize what the user described.
- NEVER add quantified outcomes (numbers, percentages), specific tools, team sizes, or results the user didn't mention.
- If the user's input is vague (e.g., "helped with a school project"), produce a modest, honest bullet — do NOT invent impressive details.
- Keep the core meaning intact while making the language professional.
- Keep the professional summary to 2-4 lines and the whole CV to one page (two pages maximum for experienced candidates).
- Use the user's provided profile summary, headline, LinkedIn, and website verbatim when present.
- Return valid JSON for the FULL structured CV object, not an array.`;

async function callGroq(systemPrompt, userMessage, temperature = 0.7) {
  const response = await getGroq().chat.completions.create({
    model: AI_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ],
    temperature,
    max_tokens: 4096,
    response_format: { type: 'json_object' }
  });

  return response.choices[0].message.content;
}

function parseAIJson(content) {
  if (!content) throw new Error('Empty AI response');
  const cleaned = content.replace(/```(?:json)?/gi, '').trim();
  return JSON.parse(cleaned);
}

async function callGroqJSON(systemPrompt, userMessage, temperature = 0.7, retries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return parseAIJson(await callGroq(systemPrompt, userMessage, temperature));
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];const MONTH_MAP = MONTHS.reduce((acc, m) => { acc[m.slice(0, 3).toLowerCase()] = m; return acc; }, {});
MONTH_MAP.sept = 'September';

function normalizeDateUnit(unit) {
  const t = String(unit || '').trim();
  if (!t) return '';
  if (/^(present|current|now|en cours|à nos jours|aujourd'?hui)$/i.test(t)) return 'Present';
  const numDate = t.match(/^(\d{1,2})\s*[/-]\s*((?:19|20)\d{2})$/);
  if (numDate) return `${MONTHS[Number(numDate[1]) - 1] || numDate[1]} ${numDate[2]}`;
  const monthYear = t.match(/^([a-zA-Z]{3,})[.\s]*((?:19|20)\d{2})$/);
  if (monthYear) {
    const m = MONTH_MAP[monthYear[1].toLowerCase().slice(0, 3)];
    return m ? `${m} ${monthYear[2]}` : `${monthYear[1]} ${monthYear[2]}`;
  }
  if (/^(?:19|20)\d{2}$/.test(t)) return t;
  return '';
}

function normalizeDateString(str) {
  if (!str) return str;
  const parts = String(str).split(/\s*(?:-|–|—|to)\s*/i).map(p => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const a = normalizeDateUnit(parts[0]);
    const b = normalizeDateUnit(parts[parts.length - 1]);
    if (a && b) return `${a} - ${b}`;
  }
  const single = normalizeDateUnit(str);
  return single || str;
}

function normalizeCvDates(cv) {
  if (!cv) return cv;
  if (Array.isArray(cv.experience)) {
    cv.experience.forEach(exp => { if (exp && exp.dates) exp.dates = normalizeDateString(exp.dates); });
  }
  if (Array.isArray(cv.education)) {
    cv.education.forEach(edu => { if (edu && edu.dates) edu.dates = normalizeDateString(edu.dates); });
  }
  return cv;
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'has',
  'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'way', 'who', 'did', 'get', 'let', 'say', 'she', 'too',
  'use', 'with', 'that', 'this', 'will', 'each', 'make', 'like', 'than', 'been', 'have', 'from', 'they', 'were',
  'being', 'would', 'could', 'should', 'about', 'into', 'just', 'also', 'more', 'some', 'only', 'very', 'your',
  'what', 'when', 'which', 'there', 'their', 'these', 'those', 'other', 'such', 'most', 'over', 'after', 'job',
  'poste', 'candidat', 'mission', 'dans', 'pour', 'une', 'des', 'les', 'avec', 'sur', 'tout', 'sera', 'êtes',
  'doit', 'vous', 'nous', 'offre', 'emploi', 'travail', 'experience', 'year', 'years', 'plus', 'bien', 'sous',
  'afin', 'également', 'minimum', 'ainsi'
]);

function extractJdKeywords(text) {
  const words = String(text || '').toLowerCase().split(/\W+/).filter(w => w.length > 3 && !STOP_WORDS.has(w));
  return [...new Set(words)].slice(0, 40);
}

exports.tailorCV = async (cvText, jobDescription, language) => {
  const jdKeywords = extractJdKeywords(jobDescription);
  const keywordHints = jdKeywords.length > 0
    ? `\nKEY TERMS FROM THE JOB DESCRIPTION (weave in only the ones the candidate's real experience supports):\n${jdKeywords.join(', ')}`
    : '';

  const userMsg = `Language: ${language === 'fr' ? 'French' : 'English'}
${language === 'fr' ? 'Adaptez le CV en français avec les conventions du CV camerounais.' : 'Tailor the CV in English using international conventions.'}

ORIGINAL CV:
${cvText}

TARGET JOB DESCRIPTION:
${jobDescription}
${keywordHints}

Please:
1. Tailor the CV content to better match this job description
2. Rewrite the summary/objective to target this specific role
3. Reorder and reframe experience bullets to highlight relevant skills
4. List keywords/skills from the job posting that are missing as "gapAnalysis"
5. Generate a tailored cover letter/motivation letter

Return JSON with keys: tailoredCV (the structured CV), coverLetter (string), gapAnalysis (array of strings)`;

  const result = await callGroqJSON(TAILOR_SYSTEM_PROMPT, userMsg, 0.7);
  return normalizeCvDates(result);
};

exports.expandQuestionnaireInput = async (data) => {
  const items = [];

  if (data.education && data.education.length > 0) {
    data.education.forEach(e => {
      items.push({
        original: `Education: ${e.institution || ''} - ${e.degree || ''} (${e.dates || ''})${e.details ? ' - ' + e.details : ''}`,
        type: 'education'
      });
    });
  }

  if (data.experience && data.experience.length > 0) {
    data.experience.forEach(e => {
      items.push({
        original: `Work: ${e.title || ''} at ${e.company || ''} (${e.dates || ''}) - ${e.description || ''}`,
        type: 'experience'
      });
    });
  }

  if (data.nonTraditionalExperience && data.nonTraditionalExperience.length > 0) {
    data.nonTraditionalExperience.forEach(n => {
      items.push({
        original: n.description || n,
        type: 'non-traditional'
      });
    });
  }

  if (data.skills && data.skills.length > 0) {
    items.push({
      original: `Skills: ${data.skills.join(', ')}`,
      type: 'skills'
    });
  }

  const userMsg = `Language: ${data.language === 'fr' ? 'French' : 'English'}

User's raw inputs:
${items.map((item, i) => `${i + 1}. [${item.type}] ${item.original}`).join('\n')}

Personal info: ${JSON.stringify(data.personalInfo)}

Certifications provided by the user:
${data.certifications && data.certifications.length
  ? data.certifications.map((c, i) => `${i + 1}. ${[c.title, c.issuer, c.year].filter(Boolean).join(' - ')}`).join('\n')
  : '(none)'}

Please expand these into a properly structured CV. For each informal/non-traditional item, expand it into a professional bullet point.
Keep the summary to 2-4 lines and the whole CV to one page (two pages maximum for experienced candidates).
Return JSON with keys: name, headline, email, phone, location, linkedin, website, summary, experience, education, certifications, skills, languages, additionalSections, nonTraditionalExperience (array of the expanded professional bullets from the user's informal activities) — matching the CV structure.`;

  const parsed = await callGroqJSON(EXPAND_SYSTEM_PROMPT, userMsg, 0.6);
  const cv = Array.isArray(parsed)
    ? { nonTraditionalExperience: parsed.map(i => i && (i.expanded || i.original)).filter(Boolean), education: [], experience: [], skills: [], certifications: [] }
    : parsed;
  normalizeCvDates(cv);
  if (!Array.isArray(cv.certifications)) cv.certifications = [];
  if (!Array.isArray(cv.nonTraditionalExperience)) cv.nonTraditionalExperience = [];
  return cv;
};

exports.generateInterviewQuestions = async (jobDescription, tailoredCV, language) => {
  const systemPrompt = `You are a career coach helping job seekers prepare for interviews.
Generate 8-10 likely interview questions based on the job description and tailored CV.
For each question, provide guidance on how to structure a strong answer using the STAR method.
Return JSON: { "questions": [{ "question": "...", "starGuidance": { "situation": "...", "task": "...", "action": "...", "result": "..." } }]
Return the questions and guidance in the requested language.`;

  const userMsg = `Language: ${language === 'fr' ? 'French' : 'English'}
Job Description: ${jobDescription}
Tailored CV: ${JSON.stringify(tailoredCV)}`;

  const result = await callGroqJSON(systemPrompt, userMsg, 0.7);
  return result;
};

const GRAMMAR_SYSTEM_PROMPT = `You are a meticulous proofreader for CVs, resumes, and cover letters.
Review the text for spelling mistakes, grammar errors, awkward phrasing, and typos.

CRITICAL RULES:
- Do NOT change factual content or rephrase for style. Only flag genuine errors.
- For each issue, provide the exact original snippet, a corrected suggestion, and a brief reason.
- If the text is clean, return an empty issues array.
- Return valid JSON: { "issues": [{ "original": "...", "suggestion": "...", "reason": "..." }], "summary": "One-line summary of the review in the requested language" }`;

const COVER_LETTER_SYSTEM_PROMPT = `You are a professional cover letter writer for job seekers in Cameroon.
CRITICAL RULES:
- NEVER fabricate information. Only use facts present in the provided CV.
- Write in the requested language. For French, use "vous" and Cameroon-appropriate conventions.
- Each variant must be a complete, ready-to-send letter (no placeholders, no brackets), 150-220 words.
- Vary the opening line, structure, and emphasis across variants while keeping all facts identical.
Return valid JSON: { "variants": [{ "tone": "tone name", "letter": "full letter text" }] }`;

exports.generateCoverLetterVariants = async ({ tailoredCV, jobDescription, language = 'en' }) => {
  const tones = language === 'fr'
    ? ['Professionnel et formel', 'Enthousiaste et chaleureux', 'Concis et direct']
    : ['Professional & formal', 'Warm & enthusiastic', 'Concise & direct'];

  const userMsg = `Language: ${language === 'fr' ? 'French' : 'English'}
Tailored CV: ${JSON.stringify(tailoredCV)}
Target job description:
${jobDescription}

Write 3 cover letter variants with these tones: ${tones.join(', ')}.
Return JSON: { "variants": [{ "tone": "<tone name>", "letter": "<full letter>" }] }`;

  const parsed = await callGroqJSON(COVER_LETTER_SYSTEM_PROMPT, userMsg, 0.8);
  return Array.isArray(parsed.variants) ? parsed.variants : [];
};

exports.checkGrammar = async (text, language = 'en') => {
  const userMsg = `Language: ${language === 'fr' ? 'French' : 'English'}

Text to review:
${text}`;

  const result = await callGroqJSON(GRAMMAR_SYSTEM_PROMPT, userMsg, 0.2);
  return result;
};
