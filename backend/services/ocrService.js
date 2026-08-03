const Groq = require('groq-sdk');
const logger = require('../utils/logger');

let groq;
function getGroq() {
  if (!groq) groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groq;
}

const PURPOSE_PROMPTS = {
  job: {
    label: 'job posting',
    extraction: 'Extract all the text from this job posting image. Return ONLY the extracted text, nothing else. If this is not a job posting, return: "NOT_A_JOB_POSTING".'
  },
  cv: {
    label: 'resume/CV',
    extraction: 'Extract ALL the text from this resume/CV image. Preserve the layout order: keep each line and section in the order it appears (contact info, summary, experience, education, skills, languages, etc.). Do not add, summarize or reformat — return ONLY the raw extracted text, line by line, nothing else. If this is not a resume/CV, return: "NOT_A_RESUME".'
  }
};

exports.extractTextFromImage = async (imageBuffer, mimeType, purpose = 'job') => {
  const config = PURPOSE_PROMPTS[purpose] || PURPOSE_PROMPTS.job;
  const base64Image = imageBuffer.toString('base64');

  try {
    const response = await getGroq().chat.completions.create({
      model: 'llama-3.2-90b-vision-preview',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: config.extraction
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 2048
    });

    const extractedText = response.choices[0].message.content.trim();

    const notFoundMarker = purpose === 'cv' ? 'NOT_A_RESUME' : 'NOT_A_JOB_POSTING';
    if (extractedText === notFoundMarker || extractedText.length < 20) {
      return {
        success: false,
        error: `Could not detect a ${config.label} in this image. Try taking a clearer photo or pasting the text instead.`
      };
    }

    return { success: true, text: extractedText };
  } catch (err) {
    logger.error('OCR extraction failed:', err.message);
    return {
      success: false,
      error: 'Image text extraction failed. Please paste the text instead.'
    };
  }
};
