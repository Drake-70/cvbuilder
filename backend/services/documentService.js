const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, ShadingType } = require('docx');
const logger = require('../utils/logger');

const A4 = { width: 11906, height: 16838 };
const MARGIN = 1134;
const FONT_SIZE = 22;
const HEADING_SIZE = 28;

const LABELS = {
  en: {
    summary: 'Professional Summary',
    experience: 'Experience',
    education: 'Education',
    skills: 'Skills',
    coverLetter: 'Cover Letter'
  },
  fr: {
    summary: 'Profil',
    experience: 'Expérience',
    education: 'Formation',
    skills: 'Compétences',
    coverLetter: 'Lettre de Motivation'
  }
};

const TEMPLATES = {
  modern: {
    font: 'Calibri',
    headingColor: '2563EB',
    headingRule: '333333',
    nameColor: '1F2937',
    nameSize: 32,
    nameFont: 'Calibri',
    band: null,
    bandRule: '2563EB',
    companyStyle: 'plain',
    contactColor: '444444'
  },
  classic: {
    font: 'Times New Roman',
    headingColor: '1A1A1A',
    headingRule: '000000',
    nameColor: '000000',
    nameSize: 28,
    nameFont: 'Times New Roman',
    band: null,
    bandRule: '000000',
    companyStyle: 'italic',
    contactColor: '1A1A1A'
  },
  creative: {
    font: 'Calibri',
    headingColor: '7C3AED',
    headingRule: '7C3AED',
    nameColor: 'FFFFFF',
    nameSize: 34,
    nameFont: 'Calibri',
    band: '7C3AED',
    bandRule: '7C3AED',
    companyStyle: 'plain',
    contactColor: '4B5563'
  }
};

function textRun(text, { size = FONT_SIZE, font = 'Calibri', bold = false, italics = false, color = null } = {}) {
  return new TextRun({ text, size, font, bold, italics, ...(color ? { color } : {}) });
}

function sectionHeading(text, tpl) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 80 },
    border: { bottom: { color: tpl.headingRule, space: 2, style: BorderStyle.SINGLE, size: 4 } },
    children: [
      textRun(text.toUpperCase(), { size: HEADING_SIZE, font: tpl.font, bold: true, color: tpl.headingColor })
    ]
  });
}

function bulletPoint(text, tpl) {
  return new Paragraph({
    spacing: { before: 40, after: 40 },
    indent: { left: 360, hanging: 180 },
    children: [
      textRun('\u2022 ', { size: FONT_SIZE, font: tpl.font }),
      textRun(text, { size: FONT_SIZE, font: tpl.font })
    ]
  });
}

function experienceSection(experience, labels, tpl) {
  if (!experience || experience.length === 0) return [];
  const paragraphs = [sectionHeading(labels.experience, tpl)];

  experience.forEach(exp => {
    paragraphs.push(new Paragraph({
      spacing: { before: 160, after: 0 },
      children: [
        textRun(exp.title || '', { size: FONT_SIZE, font: tpl.font, bold: true }),
        textRun(exp.company ? ` — ${exp.company}` : '', {
          size: FONT_SIZE,
          font: tpl.font,
          italics: tpl.companyStyle === 'italic'
        }),
        textRun(exp.dates ? `    ${exp.dates}` : '', { size: 20, font: tpl.font, italics: true, color: '666666' })
      ]
    }));

    if (exp.bullets && exp.bullets.length > 0) {
      exp.bullets.forEach(bullet => paragraphs.push(bulletPoint(bullet, tpl)));
    }
  });

  return paragraphs;
}

function educationSection(education, labels, tpl) {
  if (!education || education.length === 0) return [];
  const paragraphs = [sectionHeading(labels.education, tpl)];

  education.forEach(edu => {
    paragraphs.push(new Paragraph({
      spacing: { before: 120, after: 0 },
      children: [
        textRun(edu.degree || '', { size: FONT_SIZE, font: tpl.font, bold: true }),
        textRun(edu.institution ? ` — ${edu.institution}` : '', { size: FONT_SIZE, font: tpl.font })
      ]
    }));

    if (edu.dates) {
      paragraphs.push(new Paragraph({
        spacing: { before: 0, after: 0 },
        children: [textRun(edu.dates, { size: 20, font: tpl.font, italics: true, color: '666666' })]
      }));
    }

    if (edu.details) {
      paragraphs.push(new Paragraph({
        spacing: { before: 40, after: 40 },
        children: [textRun(edu.details, { size: FONT_SIZE, font: tpl.font })]
      }));
    }
  });

  return paragraphs;
}

function skillsSection(skills, labels, tpl) {
  if (!skills || skills.length === 0) return [];
  return [
    sectionHeading(labels.skills, tpl),
    new Paragraph({
      spacing: { before: 80, after: 80 },
      children: [textRun(skills.join(' • '), { size: FONT_SIZE, font: tpl.font })]
    })
  ];
}

function additionalSections(sections, labels, tpl) {
  if (!sections || sections.length === 0) return [];
  const paragraphs = [];
  sections.forEach(section => {
    paragraphs.push(sectionHeading(section.title, tpl));
    paragraphs.push(new Paragraph({
      spacing: { before: 80, after: 80 },
      children: [textRun(section.content || '', { size: FONT_SIZE, font: tpl.font })]
    }));
  });
  return paragraphs;
}

function coverLetterParagraphs(coverLetter, labels, tpl) {
  if (!coverLetter) return [];
  const paragraphs = [sectionHeading(labels.coverLetter, tpl)];
  coverLetter.split('\n').filter(l => l.trim()).forEach(line => {
    paragraphs.push(new Paragraph({
      spacing: { before: 80, after: 80 },
      children: [textRun(line.trim(), { size: FONT_SIZE, font: tpl.font })]
    }));
  });
  return paragraphs;
}

function contactInfo(cv) {
  const parts = [];
  if (cv.email) parts.push(cv.email);
  if (cv.phone) parts.push(cv.phone);
  if (cv.location) parts.push(cv.location);
  if (cv.nationality) parts.push(cv.nationality);
  return parts.join(' | ');
}

function nameHeader(cv, tpl, labels, lang) {
  const paragraphs = [];

  if (tpl.band) {
    paragraphs.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 200, line: 400 },
      shading: { type: ShadingType.CLEAR, fill: tpl.band },
      children: [textRun(cv.name || '', { size: tpl.nameSize, font: tpl.nameFont, bold: true, color: tpl.nameColor })]
    }));
    if (tpl.bandRule) {
      paragraphs.push(new Paragraph({
        spacing: { after: 100 },
        border: { bottom: { color: tpl.bandRule, space: 1, style: BorderStyle.SINGLE, size: 8 } },
        children: []
      }));
    }
  } else {
    paragraphs.push(new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: tpl.nameFont === 'Times New Roman' ? AlignmentType.LEFT : AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [textRun(cv.name || '', { size: tpl.nameSize, font: tpl.nameFont, bold: true, color: tpl.nameColor })]
    }));
    paragraphs.push(new Paragraph({
      spacing: { after: 160 },
      border: { bottom: { color: tpl.headingRule, space: 2, style: BorderStyle.SINGLE, size: 4 } },
      children: []
    }));
  }

  const info = contactInfo(cv);
  if (info) {
    paragraphs.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
      children: [textRun(info, { size: 20, font: tpl.font, color: tpl.contactColor })]
    }));
  }

  return paragraphs;
}

function buildDocument(cv, coverLetter, lang, templateName) {
  const tpl = TEMPLATES[templateName] || TEMPLATES.modern;
  const labels = LABELS[lang] || LABELS.en;
  const sections = [];

  sections.push(...nameHeader(cv, tpl, labels, lang));

  if (cv.summary) {
    sections.push(sectionHeading(labels.summary, tpl));
    sections.push(new Paragraph({
      spacing: { before: 80, after: 80 },
      children: [textRun(cv.summary, { size: FONT_SIZE, font: tpl.font })]
    }));
  }

  sections.push(...experienceSection(cv.experience, labels, tpl));
  sections.push(...educationSection(cv.education, labels, tpl));
  sections.push(...skillsSection(cv.skills, labels, tpl));
  sections.push(...additionalSections(cv.additionalSections, labels, tpl));
  sections.push(...coverLetterParagraphs(coverLetter, labels, tpl));

  return new Document({
    sections: [{
      properties: {
        page: {
          size: { width: A4.width, height: A4.height },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN }
        }
      },
      children: sections
    }]
  });
}

exports.generateDocx = async (cv, coverLetter, language, template = 'modern') => {
  const tpl = TEMPLATES[template] ? template : 'modern';
  const doc = buildDocument(cv || {}, coverLetter || '', language === 'fr' ? 'fr' : 'en', tpl);
  try {
    return await Packer.toBuffer(doc);
  } catch (err) {
    logger.error('Failed to generate docx: %s', err.message);
    throw err;
  }
};

exports.TEMPLATES = Object.keys(TEMPLATES);
