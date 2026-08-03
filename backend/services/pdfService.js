const PDFDocument = require('pdfkit');
const logger = require('../utils/logger');

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

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
    font: 'Helvetica',
    heading: '2563EB',
    headingRule: '333333',
    nameColor: '1F2937',
    nameSize: 26,
    nameAlign: 'center',
    band: null,
    companyItalic: false,
    contactColor: '444444'
  },
  classic: {
    font: 'Times-Roman',
    heading: '1A1A1A',
    headingRule: '000000',
    nameColor: '000000',
    nameSize: 22,
    nameAlign: 'left',
    band: null,
    companyItalic: true,
    contactColor: '1A1A1A'
  },
  creative: {
    font: 'Helvetica',
    heading: '7C3AED',
    headingRule: '7C3AED',
    nameColor: 'FFFFFF',
    nameSize: 28,
    nameAlign: 'center',
    band: '7C3AED',
    companyItalic: false,
    contactColor: '4B5563'
  },
  professional: {
    font: 'Helvetica',
    heading: '1E3A8A',
    headingRule: '1E3A8A',
    nameColor: '111827',
    nameSize: 24,
    nameAlign: 'left',
    band: null,
    companyItalic: true,
    contactColor: '374151'
  },
  minimal: {
    font: 'Helvetica',
    heading: '374151',
    headingRule: '9CA3AF',
    nameColor: '111827',
    nameSize: 20,
    nameAlign: 'left',
    band: null,
    companyItalic: false,
    contactColor: '6B7280'
  },
  bold: {
    font: 'Helvetica',
    heading: '111827',
    headingRule: '111827',
    nameColor: 'FFFFFF',
    nameSize: 24,
    nameAlign: 'center',
    band: '111827',
    companyItalic: false,
    contactColor: '4B5563'
  }
};

const FONTS = {
  Helvetica: { regular: 'Helvetica', bold: 'Helvetica-Bold', italic: 'Helvetica-Oblique', boldItalic: 'Helvetica-BoldOblique' },
  'Times-Roman': { regular: 'Times-Roman', bold: 'Times-Bold', italic: 'Times-Italic', boldItalic: 'Times-BoldItalic' }
};

function hexToRgb(hex) {
  const value = (hex || '000000').replace('#', '');
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16)
  };
}

function sectionHeading(doc, tpl, text, y) {
  const color = hexToRgb(tpl.heading);
  doc
    .font(FONTS[tpl.font].bold)
    .fontSize(11)
    .fillColor(color)
    .text(text.toUpperCase(), MARGIN, y);

  const after = doc.y + 4;
  doc
    .strokeColor(tpl.headingRule)
    .lineWidth(0.8)
    .moveTo(MARGIN, after)
    .lineTo(PAGE_WIDTH - MARGIN, after)
    .stroke();

  doc.moveDown(0.9);
  doc.fillColor('000000');
}

function contactInfo(cv) {
  const parts = [];
  if (cv.email) parts.push(cv.email);
  if (cv.phone) parts.push(cv.phone);
  if (cv.location) parts.push(cv.location);
  if (cv.nationality) parts.push(cv.nationality);
  return parts.join('  |  ');
}

function nameHeader(doc, tpl, cv) {
  const name = cv.name || '';

  if (tpl.band) {
    const bandHeight = 46;
    doc
      .rect(0, doc.y, PAGE_WIDTH, bandHeight)
      .fill(hexToRgb(tpl.band));
    doc
      .fillColor('FFFFFF')
      .font(FONTS[tpl.font].bold)
      .fontSize(tpl.nameSize)
      .text(name, MARGIN, doc.y + 8, { width: CONTENT_WIDTH, align: 'center' });
    doc.y += bandHeight - 20;
    doc
      .rect(MARGIN, doc.y, CONTENT_WIDTH, 4)
      .fill(hexToRgb(tpl.band));
    doc.y += 16;
  } else {
    doc
      .fillColor(tpl.nameColor)
      .font(FONTS[tpl.font].bold)
      .fontSize(tpl.nameSize)
      .text(name, MARGIN, doc.y, { width: CONTENT_WIDTH, align: tpl.nameAlign });
    doc.moveDown(0.2);
    doc
      .strokeColor(tpl.headingRule)
      .lineWidth(1)
      .moveTo(MARGIN, doc.y)
      .lineTo(PAGE_WIDTH - MARGIN, doc.y)
      .stroke();
    doc.moveDown(0.7);
  }

  const info = contactInfo(cv);
  if (info) {
    doc
      .fillColor(tpl.contactColor)
      .font(FONTS[tpl.font].regular)
      .fontSize(9)
      .text(info, MARGIN, doc.y, { width: CONTENT_WIDTH, align: 'center' });
    doc.moveDown(1.2);
  } else {
    doc.moveDown(0.8);
  }
  doc.fillColor('000000');
}

function writeSection(doc, tpl, cv) {
  if (cv.summary) {
    sectionHeading(doc, tpl, LABELS[cv.language]?.summary || LABELS.en.summary);
    doc
      .font(FONTS[tpl.font].regular)
      .fontSize(10)
      .text(cv.summary, { width: CONTENT_WIDTH, lineGap: 2 });
    doc.moveDown(0.9);
  }

  if (cv.experience && cv.experience.length > 0) {
    sectionHeading(doc, tpl, LABELS[cv.language]?.experience || LABELS.en.experience);
    cv.experience.forEach(exp => {
      doc
        .font(FONTS[tpl.font].bold)
        .fontSize(10)
        .text(exp.title || '', { continued: true });
      if (exp.company) {
        doc
          .font(FONTS[tpl.font][tpl.companyItalic ? 'italic' : 'regular'])
          .text(`  —  ${exp.company}`, { continued: true });
      }
      if (exp.dates) {
        doc
          .font(FONTS[tpl.font].italic)
          .fontSize(9)
          .fillColor('666666')
          .text(`   ${exp.dates}`);
        doc.fillColor('000000');
      } else {
        doc.moveDown(0.15);
      }
      if (exp.bullets && exp.bullets.length > 0) {
        doc.font(FONTS[tpl.font].regular).fontSize(10);
        exp.bullets.forEach(bullet => {
          doc.text(`•  ${bullet}`, { width: CONTENT_WIDTH - 18, lineGap: 2 });
        });
      }
      doc.moveDown(0.5);
    });
  }

  if (cv.education && cv.education.length > 0) {
    sectionHeading(doc, tpl, LABELS[cv.language]?.education || LABELS.en.education);
    cv.education.forEach(edu => {
      doc
        .font(FONTS[tpl.font].bold)
        .fontSize(10)
        .text(edu.degree || '', { continued: true });
      if (edu.institution) {
        doc
          .font(FONTS[tpl.font].regular)
          .text(`  —  ${edu.institution}`);
      } else {
        doc.moveDown(0.15);
      }
      if (edu.dates) {
        doc
          .font(FONTS[tpl.font].italic)
          .fontSize(9)
          .fillColor('666666')
          .text(edu.dates);
        doc.fillColor('000000');
      }
      if (edu.details) {
        doc
          .font(FONTS[tpl.font].regular)
          .fontSize(10)
          .text(edu.details);
      }
      doc.moveDown(0.5);
    });
  }

  if (cv.skills && cv.skills.length > 0) {
    sectionHeading(doc, tpl, LABELS[cv.language]?.skills || LABELS.en.skills);
    doc
      .font(FONTS[tpl.font].regular)
      .fontSize(10)
      .text(cv.skills.join('  •  '), { width: CONTENT_WIDTH });
    doc.moveDown(0.9);
  }

  if (cv.additionalSections && cv.additionalSections.length > 0) {
    cv.additionalSections.forEach(section => {
      sectionHeading(doc, tpl, section.title || '');
      doc
        .font(FONTS[tpl.font].regular)
        .fontSize(10)
        .text(section.content || '', { width: CONTENT_WIDTH, lineGap: 2 });
      doc.moveDown(0.7);
    });
  }
}

function generatePdf(cv, coverLetter, language, templateName = 'modern') {
  const tpl = TEMPLATES[templateName] || TEMPLATES.modern;
  const lang = language === 'fr' ? 'fr' : 'en';
  const labels = LABELS[lang];
  const normalized = { ...(cv || {}), language: lang };

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN }
      });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      nameHeader(doc, tpl, normalized);
      writeSection(doc, tpl, normalized);
      if (coverLetter) {
        doc.addPage();
        sectionHeading(doc, tpl, labels.coverLetter);
        coverLetter.split('\n').filter(l => l.trim()).forEach(line => {
          doc
            .font(FONTS[tpl.font].regular)
            .fontSize(10)
            .text(line.trim(), { width: CONTENT_WIDTH, lineGap: 2 });
          doc.moveDown(0.4);
        });
      }

      doc.end();
    } catch (err) {
      logger.error('Failed to generate PDF: %s', err.message);
      reject(err);
    }
  });
}

exports.generatePdf = generatePdf;
exports.PDF_TEMPLATES = Object.keys(TEMPLATES);
