const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, TabStopPosition, TabStopType, UnderlineType } = require('docx');
const logger = require('../utils/logger');

const FONT_SIZE = 22;
const HEADING_SIZE = 28;
const MARGIN = 1134;

function createSectionHeading(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 80 },
    border: {
      bottom: { color: '333333', space: 2, style: BorderStyle.SINGLE, size: 1 }
    },
    children: [
      new TextRun({
        text: text.toUpperCase(),
        bold: true,
        size: HEADING_SIZE,
        font: 'Calibri',
        color: '1a1a1a'
      })
    ]
  });
}

function createBulletPoint(text) {
  return new Paragraph({
    spacing: { before: 40, after: 40 },
    indent: { left: 360, hanging: 180 },
    children: [
      new TextRun({ text: '\u2022 ', size: FONT_SIZE, font: 'Calibri' }),
      new TextRun({ text, size: FONT_SIZE, font: 'Calibri' })
    ]
  });
}

function createExperienceSection(experience) {
  if (!experience || experience.length === 0) return [];
  const paragraphs = [createSectionHeading('Experience')];

  experience.forEach(exp => {
    paragraphs.push(new Paragraph({
      spacing: { before: 160, after: 0 },
      children: [
        new TextRun({ text: exp.title || '', bold: true, size: FONT_SIZE, font: 'Calibri' }),
        new TextRun({ text: exp.company ? ` — ${exp.company}` : '', size: FONT_SIZE, font: 'Calibri' }),
        new TextRun({ text: exp.dates ? `    ${exp.dates}` : '', size: 20, font: 'Calibri', color: '666666', italics: true })
      ]
    }));

    if (exp.bullets && exp.bullets.length > 0) {
      exp.bullets.forEach(bullet => {
        paragraphs.push(createBulletPoint(bullet));
      });
    }
  });

  return paragraphs;
}

function createEducationSection(education) {
  if (!education || education.length === 0) return [];
  const paragraphs = [createSectionHeading('Education')];

  education.forEach(edu => {
    paragraphs.push(new Paragraph({
      spacing: { before: 120, after: 0 },
      children: [
        new TextRun({ text: edu.degree || '', bold: true, size: FONT_SIZE, font: 'Calibri' }),
        new TextRun({ text: edu.institution ? ` — ${edu.institution}` : '', size: FONT_SIZE, font: 'Calibri' })
      ]
    }));

    if (edu.dates) {
      paragraphs.push(new Paragraph({
        spacing: { before: 0, after: 0 },
        children: [
          new TextRun({ text: edu.dates, size: 20, font: 'Calibri', color: '666666', italics: true })
        ]
      }));
    }

    if (edu.details) {
      paragraphs.push(new Paragraph({
        spacing: { before: 40, after: 40 },
        children: [
          new TextRun({ text: edu.details, size: FONT_SIZE, font: 'Calibri' })
        ]
      }));
    }
  });

  return paragraphs;
}

function createSkillsSection(skills) {
  if (!skills || skills.length === 0) return [];
  return [
    createSectionHeading('Skills'),
    new Paragraph({
      spacing: { before: 80, after: 80 },
      children: [
        new TextRun({ text: skills.join(' • '), size: FONT_SIZE, font: 'Calibri' })
      ]
    })
  ];
}

function createAdditionalSections(sections) {
  if (!sections || sections.length === 0) return [];
  const paragraphs = [];

  sections.forEach(section => {
    paragraphs.push(createSectionHeading(section.title));
    paragraphs.push(new Paragraph({
      spacing: { before: 80, after: 80 },
      children: [
        new TextRun({ text: section.content || '', size: FONT_SIZE, font: 'Calibri' })
      ]
    }));
  });

  return paragraphs;
}

function createCoverLetterParagraphs(coverLetter) {
  if (!coverLetter) return [];
  const paragraphs = [createSectionHeading('Cover Letter')];

  const lines = coverLetter.split('\n').filter(l => l.trim());
  lines.forEach(line => {
    paragraphs.push(new Paragraph({
      spacing: { before: 80, after: 80 },
      children: [
        new TextRun({ text: line.trim(), size: FONT_SIZE, font: 'Calibri' })
      ]
    }));
  });

  return paragraphs;
}

function buildFrenchTemplate(cv, coverLetter) {
  const sections = [];

  sections.push(new Paragraph({
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
    children: [
      new TextRun({ text: cv.name || '', bold: true, size: 32, font: 'Calibri' })
    ]
  }));

  const contactInfo = [];
  if (cv.email) contactInfo.push(cv.email);
  if (cv.phone) contactInfo.push(cv.phone);
  if (cv.location) contactInfo.push(cv.location);
  if (cv.dateOfBirth) contactInfo.push(`Né(e) le ${cv.dateOfBirth}`);
  if (cv.nationality) contactInfo.push(cv.nationality);

  if (contactInfo.length > 0) {
    sections.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
      children: [
        new TextRun({ text: contactInfo.join(' | '), size: 20, font: 'Calibri', color: '444444' })
      ]
    }));
  }

  if (cv.summary) {
    sections.push(createSectionHeading('Profil'));
    sections.push(new Paragraph({
      spacing: { before: 80, after: 80 },
      children: [
        new TextRun({ text: cv.summary, size: FONT_SIZE, font: 'Calibri' })
      ]
    }));
  }

  sections.push(...createExperienceSection(cv.experience));
  sections.push(...createEducationSection(cv.education));
  sections.push(...createSkillsSection(cv.skills));
  sections.push(...createAdditionalSections(cv.additionalSections));
  sections.push(...createCoverLetterParagraphs(coverLetter));

  return new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN }
        }
      },
      children: sections
    }]
  });
}

function buildEnglishTemplate(cv, coverLetter) {
  const sections = [];

  sections.push(new Paragraph({
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
    children: [
      new TextRun({ text: cv.name || '', bold: true, size: 32, font: 'Calibri' })
    ]
  }));

  const contactInfo = [];
  if (cv.email) contactInfo.push(cv.email);
  if (cv.phone) contactInfo.push(cv.phone);
  if (cv.location) contactInfo.push(cv.location);

  if (contactInfo.length > 0) {
    sections.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
      children: [
        new TextRun({ text: contactInfo.join(' | '), size: 20, font: 'Calibri', color: '444444' })
      ]
    }));
  }

  if (cv.summary) {
    sections.push(createSectionHeading('Professional Summary'));
    sections.push(new Paragraph({
      spacing: { before: 80, after: 80 },
      children: [
        new TextRun({ text: cv.summary, size: FONT_SIZE, font: 'Calibri' })
      ]
    }));
  }

  sections.push(...createExperienceSection(cv.experience));
  sections.push(...createEducationSection(cv.education));
  sections.push(...createSkillsSection(cv.skills));
  sections.push(...createAdditionalSections(cv.additionalSections));
  sections.push(...createCoverLetterParagraphs(coverLetter));

  return new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN }
        }
      },
      children: sections
    }]
  });
}

exports.generateDocx = async (cv, coverLetter, language) => {
  const doc = language === 'fr'
    ? buildFrenchTemplate(cv, coverLetter)
    : buildEnglishTemplate(cv, coverLetter);

  const buffer = await Packer.toBuffer(doc);
  return buffer;
};
