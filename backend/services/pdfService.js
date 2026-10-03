const PDFDocument = require('pdfkit');
const logger = require('../utils/logger');
const { shouldSkillsFirst } = require('./cvLayout');
const { buildLatexDocument, isLatexTemplate, LATEX_TEMPLATES } = require('./latexService');
const latexEngine = require('./latexEngine');

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
    certifications: 'Certifications',
    coverLetter: 'Cover Letter'
  },
  fr: {
    summary: 'Profil',
    experience: 'Expérience',
    education: 'Formation',
    skills: 'Compétences',
    certifications: 'Certifications',
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
    nameAlign: 'left',
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
  if (cv.email) parts.push({ text: cv.email });
  if (cv.phone) parts.push({ text: cv.phone });
  if (cv.location) parts.push({ text: cv.location });
  if (cv.nationality) parts.push({ text: cv.nationality });
  if (cv.linkedin) parts.push({ text: cv.linkedin, url: cv.linkedin });
  if (cv.website) parts.push({ text: cv.website, url: cv.website });
  return parts;
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
  const infoAlign = tpl.nameAlign || 'center';
  if (cv.headline) {
    doc
      .fillColor(tpl.heading)
      .font(FONTS[tpl.font].italic)
      .fontSize(11)
      .text(cv.headline, MARGIN, doc.y, { width: CONTENT_WIDTH, align: infoAlign });
    doc.moveDown(0.6);
  }
  if (info.length) {
    doc
      .fillColor(tpl.contactColor)
      .font(FONTS[tpl.font].regular)
      .fontSize(9);
    info.forEach((part, i) => {
      if (i > 0) doc.text('  |  ', { continued: true });
      const opts = { width: CONTENT_WIDTH, align: infoAlign, continued: i < info.length - 1 };
      if (part.url) opts.link = part.url;
      doc.text(part.text, opts);
    });
    doc.moveDown(1.2);
  } else {
    doc.moveDown(0.8);
  }
  doc.fillColor('000000');
}

function writeSection(doc, tpl, cv) {
  const skillsFirst = shouldSkillsFirst(cv);

  const renderSkills = () => {
    if (cv.skills && cv.skills.length > 0) {
      sectionHeading(doc, tpl, LABELS[cv.language]?.skills || LABELS.en.skills);
      doc
        .font(FONTS[tpl.font].regular)
        .fontSize(10)
        .text(cv.skills.join(', '), { width: CONTENT_WIDTH });
      doc.moveDown(0.9);
    }
  };

  if (cv.summary) {
    sectionHeading(doc, tpl, LABELS[cv.language]?.summary || LABELS.en.summary);
    doc
      .font(FONTS[tpl.font].regular)
      .fontSize(10)
      .text(cv.summary, { width: CONTENT_WIDTH, lineGap: 2 });
    doc.moveDown(0.9);
  }

  if (skillsFirst) renderSkills();

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

  if (!skillsFirst) renderSkills();

  if (cv.certifications && cv.certifications.length > 0) {
    sectionHeading(doc, tpl, LABELS[cv.language]?.certifications || LABELS.en.certifications);
    cv.certifications.forEach(cert => {
      const head = [cert.title, cert.issuer && ` — ${cert.issuer}`].filter(Boolean).join(' ');
      const line = cert.year ? `${head}   (${cert.year})` : head;
      doc
        .font(FONTS[tpl.font].regular)
        .fontSize(10)
        .text(line, { width: CONTENT_WIDTH });
      doc.moveDown(0.4);
    });
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

function applyWatermark(doc, text) {
  const pageRange = doc.bufferedPageRange();
  const centerX = PAGE_WIDTH / 2;
  const centerY = PAGE_HEIGHT / 2;
  for (let i = 0; i < pageRange.count; i++) {
    doc.switchToPage(pageRange.start + i);
    doc.save();
    doc.opacity(0.14);
    doc.translate(centerX, centerY);
    doc.rotate(38);
    doc
      .font('Helvetica-Bold')
      .fontSize(46)
      .fillColor('#6B7280')
      .text(text, -280, -24, { width: 560, align: 'center' });
    doc.restore();
  }
}

// The pdfkit template a LaTeX template degrades to when the engine is missing.
//
// `latex-modern` -> `modern` is the same document design in the other engine, so
// a fallback is nearly invisible. The mapping is explicit rather than a computed
// string strip so that a LaTeX template with no pdfkit counterpart (an academic
// CV, say) cannot silently become `modern` by accident: it has to be listed here.
const LATEX_FALLBACK = {
  'latex-classic': 'classic',
  'latex-compact': 'minimal'
};

function fallbackTemplate(templateName) {
  return LATEX_FALLBACK[templateName] || 'modern';
}

// Renders with pdfkit. Split out from generatePdf so the fallback path is the
// same code the pdfkit templates have always used, rather than a second
// implementation that could drift from the first.
function generateWithPdfkit(cv, coverLetter, language, templateName, watermarkText) {
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

      if (watermarkText) applyWatermark(doc, watermarkText);

      doc.end();
    } catch (err) {
      logger.error('Failed to generate PDF: %s', err.message);
      reject(err);
    }
  });
}

function generateLatexPdf(cv, coverLetter, language, templateName, watermarkText) {
  // The watermark is part of the document, so it goes through the pure builder
  // rather than being bolted on by the engine.
  const source = buildLatexDocument(cv, {
    template: templateName,
    language,
    coverLetter,
    watermark: watermarkText
  });
  return latexEngine.compile(source);
}

async function generatePdf(cv, coverLetter, language, templateName = 'modern', watermarkText = null) {
  if (!isLatexTemplate(templateName)) {
    return generateWithPdfkit(cv, coverLetter, language, templateName, watermarkText);
  }

  try {
    // Checked here as well as in the picker. The picker hides the templates when
    // the engine is missing, but a document can be rendered from a template chosen
    // before a deploy that removed the engine, and a stored template is re-read on
    // download. Probing first costs nothing (the answer is cached for the life of
    // the process) and labels the failure as a missing engine rather than as a
    // compile error.
    if (!latexEngine.isAvailable()) {
      const err = new Error('LaTeX engine not available');
      err.code = 'ENGINE_MISSING';
      throw err;
    }

    return await generateLatexPdf(cv, coverLetter, language, templateName, watermarkText);
  } catch (err) {
    // A PDF that fails to render is a 500 on someone's only copy of their CV, at
    // the moment they are trying to apply. pdfkit is always present -- it is a
    // dependency of the backend, not an optional extra -- so there is always a
    // document to hand back. The template degrades to its pdfkit counterpart and
    // the substitution is logged, because an unlogged substitution is a bug
    // report weeks later with no way to explain the output.
    logger.warn(
      'LaTeX render failed for template %s (%s); falling back to pdfkit template %s',
      templateName, err.message, fallbackTemplate(templateName)
    );
    return generateWithPdfkit(cv, coverLetter, language, fallbackTemplate(templateName), watermarkText);
  }
}

/**
 * Templates this build can actually render, as a PDF.
 *
 * The picker is driven from this rather than from a hardcoded list so it cannot
 * offer a LaTeX template on a build without the engine, where choosing it would
 * silently produce a different document. The six pdfkit templates are always
 * present.
 */
function availablePdfTemplates() {
  const engineReady = latexEngine.isAvailable();
  return {
    pdf: [...Object.keys(TEMPLATES), ...(engineReady ? LATEX_TEMPLATES : [])],
    docx: Object.keys(TEMPLATES),
    engine: engineReady ? 'tectonic' : null
  };
}

// Whether a template name is meaningful for a format. This is about format
// compatibility, which is static, and is deliberately NOT the same question as
// `availablePdfTemplates`, which is about this deployment.
//
// The distinction matters: a stored `latex-classic` still has to be renderable on
// a build without the engine, and the way to guarantee that is to let it through
// here and let generatePdf's fallback handle it -- producing the `classic`
// counterpart. Rejecting it as an invalid template would instead turn an old
// document's download into a 400.
//
// A LaTeX template sent for .docx is a different case: there is no fallback and
// no counterpart, the .docx renderer would quietly use its default, so it is not
// a valid docx template.
function isTemplateValidFor(format, name) {
  if (typeof name !== 'string' || !name) return false;
  if (format === 'pdf') return isLatexTemplate(name) || Object.prototype.hasOwnProperty.call(TEMPLATES, name);
  return Object.prototype.hasOwnProperty.call(TEMPLATES, name);
}

exports.generatePdf = generatePdf;
exports.availablePdfTemplates = availablePdfTemplates;
exports.isTemplateValidFor = isTemplateValidFor;
exports.PDF_TEMPLATES = Object.keys(TEMPLATES);
