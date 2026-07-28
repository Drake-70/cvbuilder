const Groq = require('groq-sdk');
const logger = require('../utils/logger');

let groq;
function getGroq() {
  if (!groq) groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groq;
}

// Extract job description text from an image using Groq's vision capabilities
// Note: Groq currently supports text-based models. For vision/OCR, we use the
// image-to-text approach: send the base64 image and ask the model to describe/extract text.
// If Groq adds vision support, update the model name here.

exports.extractTextFromImage = async (imageBuffer, mimeType) => {
  // Since Groq doesn't have native vision support yet, we'll use a simple approach:
  // Convert the image to base64 and use the multimodal model if available,
  // otherwise fall back to instructing the user to paste text.

  const base64Image = imageBuffer.toString('base64');

  try {
    // Try using Groq's multimodal capabilities
    const response = await getGroq().chat.completions.create({
      model: 'llama-3.2-90b-vision-preview',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract all the text from this job posting image. Return ONLY the extracted text, nothing else. If this is not a job posting, return: "NOT_A_JOB_POSTING".'
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

    if (extractedText === 'NOT_A_JOB_POSTING' || extractedText.length < 20) {
      return {
        success: false,
        error: 'Could not detect a job posting in this image. Try taking a clearer screenshot or pasting the text instead.'
      };
    }

    return { success: true, text: extractedText };
  } catch (err) {
    logger.error('OCR extraction failed:', err.message);
    return {
      success: false,
      error: 'Image text extraction failed. Please paste the job description text instead.'
    };
  }
};
