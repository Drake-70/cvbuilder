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

You must return valid JSON matching this structure:
{
  "name": "Full name from the CV",
  "email": "Email from the CV",
  "phone": "Phone number from the CV",
  "location": "Location/city from the CV",
  "summary": "Professional summary tailored to the job",
  "experience": [
    { "title": "Job title", "company": "Company name", "dates": "Start - End", "bullets": ["bullet point 1"] }
  ],
  "education": [
    { "institution": "School name", "degree": "Qualification", "dates": "Start - End", "details": "Additional info" }
  ],
  "skills": ["skill 1", "skill 2"],
  "languages": ["language 1"],
  "additionalSections": [
    { "title": "Section name", "content": "Content" }
  ]
}`;

const EXPAND_SYSTEM_PROMPT = `You are a CV writing assistant helping first-time job seekers in Cameroon.
The user will give you short, informal descriptions of their activities and experiences.
Your job is to expand these into properly phrased, professional CV bullet points.

CRITICAL RULES:
- NEVER fabricate information. Only rephrase and professionalize what the user described.
- NEVER add quantified outcomes (numbers, percentages), specific tools, team sizes, or results the user didn't mention.
- If the user's input is vague (e.g., "helped with a school project"), produce a modest, honest bullet — do NOT invent impressive details.
- Keep the core meaning intact while making the language professional.
- Return the expanded items as JSON array: [{ "original": "user input", "expanded": "professional bullet", "section": "suggested section" }]
- Suggest which CV section this belongs to: "experience", "education", "skills", or "additional".`;

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

exports.tailorCV = async (cvText, jobDescription, language) => {
  const userMsg = `Language: ${language === 'fr' ? 'French' : 'English'}
${language === 'fr' ? 'Adaptez le CV en français avec les conventions du CV camerounais.' : 'Tailor the CV in English using international conventions.'}

ORIGINAL CV:
${cvText}

TARGET JOB DESCRIPTION:
${jobDescription}

Please:
1. Tailor the CV content to better match this job description
2. Rewrite the summary/objective to target this specific role
3. Reorder and reframe experience bullets to highlight relevant skills
4. List keywords/skills from the job posting that are missing as "gapAnalysis"
5. Generate a tailored cover letter/motivation letter

Return JSON with keys: tailoredCV (the structured CV), coverLetter (string), gapAnalysis (array of strings)`;

  const result = await callGroq(TAILOR_SYSTEM_PROMPT, userMsg, 0.7);
  return JSON.parse(result);
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

Please expand these into a properly structured CV. For each informal/non-traditional item, expand it into a professional bullet point.
Return JSON with keys: name, email, phone, location, summary, experience, education, skills, languages, additionalSections — matching the CV structure.`;

  const result = await callGroq(EXPAND_SYSTEM_PROMPT, userMsg, 0.6);
  return JSON.parse(result);
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

  const result = await callGroq(systemPrompt, userMsg, 0.7);
  return JSON.parse(result);
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

  const result = await callGroq(COVER_LETTER_SYSTEM_PROMPT, userMsg, 0.8);
  const parsed = JSON.parse(result);
  return Array.isArray(parsed.variants) ? parsed.variants : [];
};

exports.checkGrammar = async (text, language = 'en') => {
  const userMsg = `Language: ${language === 'fr' ? 'French' : 'English'}

Text to review:
${text}`;

  const result = await callGroq(GRAMMAR_SYSTEM_PROMPT, userMsg, 0.2);
  return JSON.parse(result);
};
