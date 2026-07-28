const Groq = require('groq-sdk');
const logger = require('../utils/logger');

let groq;
function getGroq() {
  if (!groq) groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groq;
}

exports.generateLinkedInProfile = async (tailoredCV, jobDescription, language) => {
  const systemPrompt = `You are a LinkedIn profile writer specializing in the Cameroonian job market.
Given a tailored CV and optionally a job description, generate a LinkedIn headline and About section.

RULES:
- Headline: max 220 characters, punchy, keyword-rich, not a full sentence — use separators like "|" or "•"
- About section: 3-4 short paragraphs, conversational but professional tone, max 2600 characters
- Adapt to the target language (French conventions for FR, English for EN)
- Never fabricate — only use facts from the provided CV
- Include a clear call-to-action in the About section
- Use first person voice ("I am..." not "John is...")

Return JSON: { "headline": "...", "about": "..." }`;

  const userMsg = `Language: ${language === 'fr' ? 'French' : 'English'}
${language === 'fr' ? 'Rédigez en français avec les conventions professionnelles camerounaises.' : 'Write in English with international professional conventions.'}

CV Content:
${JSON.stringify(tailoredCV, null, 2)}

${jobDescription ? `Target Job Description:\n${jobDescription}` : ''}`;

  const response = await getGroq().chat.completions.create({
    model: 'openai/gpt-oss-120b',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMsg }
    ],
    temperature: 0.7,
    max_tokens: 1024,
    response_format: { type: 'json_object' }
  });

  return JSON.parse(response.choices[0].message.content);
};
