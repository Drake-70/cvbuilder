// LaTeX CV rendering.
//
// Why this exists at all: pdfkit draws a PDF by placing every glyph itself, which
// caps it at one page size, one set of metrics and no hyphenation. A CV is
// exactly the document that suffers from that — long bullets, two-column dates,
// French accents. LaTeX has real line-breaking, so it produces a document that
// reflows instead of one whose every line break was chosen by hand.
//
// Everything in this module is pure string building. The engine lives in
// latexEngine.js and the fallback in pdfService.js, so the part that can silently
// corrupt someone's CV is testable without running a compiler.
//
// This is deliberately separate from pdfService.js's `TEMPLATES` rather than an
// extension of it: those describe pdfkit draw calls (fonts, colours, a coloured
// band), which have no meaning here. Sharing the names would let someone add a
// pdfkit template and assume a LaTeX one appeared.

const { shouldSkillsFirst } = require('./cvLayout');

// The compiler is XeTeX, so UTF-8 is native and no escaping of non-ASCII is
// needed, and no `inputenc` is needed either -- XeTeX would ignore it.
//
// T1 encoding is set because the default OT1 encoding has no accented glyphs, and
// this product's users are largely francophone. T1 on its own is a trap: with
// Computer Modern it needs the EC font metrics, which tectonic's offline bundle
// does not carry, and the compile fails with a fontconfig error. Loading
// `newtxtext` in the same preamble supplies those metrics, so T1 is always paired
// with a font package here. Verified against tectonic 0.17.0 -- see the note on
// TEMPLATES for what this rules out.
const CORE = `\\usepackage{xcolor}
\\usepackage[hidelinks]{hyperref}`;

// Uppercasing is done here rather than with \\MakeUppercase because that follows
// TeX's own case-mapping rules, which differ from JavaScript's for a handful of
// characters. Doing it here means the string in the PDF matches the string in the
// locale files, and it is testable without compiling anything.
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
    coverLetter: 'Lettre de motivation'
  }
};

// Every template is serif, and that is a constraint rather than a preference.
//
// A sans-serif LaTeX template needs `helvet`, `tgheros` or `newtxsf`. None of
// them are in tectonic's offline bundle -- verified individually against 0.17.0,
// where each fails with "File not found" -- and the two that could be made to work
// by installing fontconfig (`newtxsf`, or fontspec by font *name*) then depend on
// fontconfig being present and configured in the container, which cannot be
// checked from a build. `newtxtext` is the one font package the bundle carries
// that needs no fontconfig, so both templates use it.
//
// The two designs therefore differ in layout and density rather than in typeface,
// which is also the more useful axis for a CV. Anyone wanting sans has the pdfkit
// templates, which are unaffected.
//
// If a sans LaTeX template is ever wanted, the work is: add `fontconfig` and a
// real font package to both Docker stages, copy /etc/fonts across, and re-probe.
const TEMPLATES = {
  // Serif, centred, ruled. The European CV convention, and the one that survives
  // being printed and re-read on paper.
  'latex-classic': {
    fontPackages: '\\usepackage[T1]{fontenc}\n\\usepackage{newtxtext}',
    margin: '18mm',
    headingColor: '1A1A1A',
    ruleColor: '1A1A1A',
    rules: true,
    nameSize: '\\LARGE',
    nameAlign: 'center',
    bodySize: '11pt',
    contactSize: '\\footnotesize',
    sectionGap: '2.6mm',
    ruleGap: '1.6mm'
  },
  // Left-aligned, unruled, tighter margins and spacing. For the CV that has run to
  // two pages, which is the case LaTeX line-breaking actually helps with.
  // 11pt like the other template, not 10pt: the bundle carries only size11.clo, so
  // a 10pt preamble fails with "File `size10.clo' not found".
  'latex-compact': {
    fontPackages: '\\usepackage[T1]{fontenc}\n\\usepackage{newtxtext}',
    margin: '14mm',
    headingColor: '374151',
    ruleColor: '374151',
    rules: false,
    nameSize: '\\Large',
    nameAlign: 'left',
    bodySize: '11pt',
    contactSize: '\\footnotesize',
    sectionGap: '1.8mm',
    ruleGap: '0.9mm'
  }
};

// LaTeX is a programming language that the CV is being interpolated into, so
// every character with meaning to it has to be neutralised. The backslash is
// handled first: doing it later would re-escape the backslashes this function
// introduces and produce "\\%" where it meant "\%".
const TEX_ESCAPES = {
  '\\': '\\textbackslash{}',
  '&': '\\&',
  '%': '\\%',
  $: '\\$',
  '#': '\\#',
  _: '\\_',
  '{': '\\{',
  '}': '\\}',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}'
};

const NEEDS_ESCAPE = /[\\&%$#_{}~^]/g;

// The separator between a job title and its company. The pdfkit renderer draws
// an em dash with spaces around it; this is the same shape, expressed as LaTeX so
// it does not depend on the font having U+2014 in the T1 encoding.
const EM_DASH = ' \\textemdash{} ';

// Control characters other than tab and newline are not representable and make
// the compiler error out with a message that points at the line, not the cause.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function tex(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(CONTROL_CHARS, '')
    .replace(/\r\n?/g, '\n')
    .replace(NEEDS_ESCAPE, (ch) => TEX_ESCAPES[ch]);
}

// A URL in \url{} is set in a monospaced font and does not break lines, which is
// the wrong trade for a long domain that wraps. So it is typeset as ordinary text
// inside a hyperlink instead.
//
// Only the href body needs its own escaping rules, because \href reads its first
// argument as a URL rather than as document text, where three characters mean
// something different and break the build outright:
//
//   %   starts a comment, silently swallowing the rest of the line
//   #   is a macro parameter character ("Illegal parameter number")
//   \   is already the escape character itself
//
// An unescaped & is deliberately left alone. It is not special to the TeX reader
// outside an alignment, and both spellings were compiled with tectonic 0.17.0 and
// the link annotation read back out of the PDF: \href with \& and \href with a bare
// & both produce the identical /URI, because hyperref applies \dospecials when it
// normalises the URL and drops the backslash again. So escaping it would change
// nothing while making this the one character with a special case.
//
// A `www.` host gets a scheme prepended because \href has no default, and several
// ATS parsers treat a bare domain as prose.
function href(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;
  return `\\href{${raw.replace(/([%#\\])/g, '\\$1')}}{`;
}

function normaliseUrl(raw) {
  return /^www\./i.test(raw) ? `https://${raw}` : raw;
}

function contactParts(cv) {
  const parts = [];

  const add = (value, url) => {
    const text = tex(value);
    if (!text.trim()) return;
    parts.push(url ? { text, open: href(normaliseUrl(url)), close: '}' } : { text });
  };

  add(cv.email, cv.email && `mailto:${String(cv.email).trim()}`);
  add(cv.phone);
  add(cv.location);
  add(cv.nationality);
  add(cv.linkedin, cv.linkedin);
  add(cv.website, cv.website);

  return parts;
}

// A middot, set in text mode. Not `$\cdot$`: math mode drags in the Computer
// Modern maths fonts (cmsy, cmmi), and tectonic's offline bundle does not carry
// them, so a document with a maths symbol fails at the xdvipdfmx stage with
// "Cannot proceed without .vf or physical font for PDF output". A CV has no
// maths in it, so nothing here should ever enter math mode.
const SEPARATOR = '  \\textperiodcentered{}  ';

function contactLine(cv) {
  const parts = contactParts(cv)
    .map(part => (part.open ? `${part.open}${part.text}${part.close}` : part.text))
    .filter(Boolean);
  return parts.length ? parts.join(SEPARATOR) : '';
}

function heading(text, color, ruleColor, tpl) {
  const out = ['\\vspace{' + tpl.sectionGap + '}', `\\noindent{\\color{${color}}\\bfseries ${text}}\\par`];
  if (tpl.rules) {
    out.push('\\vspace{-0.6mm}');
    out.push(`\\noindent{\\color{${ruleColor}}\\rule{\\linewidth}{0.4pt}}\\par`);
  }
  out.push('\\vspace{' + tpl.ruleGap + '}');
  return out.join('\n');
}

function roleLine(parts, color) {
  return `\\noindent\\textcolor{${color}}{${parts.join(EM_DASH)}}`;
}

// Enumitem is avoided entirely: the defaults are rebuilt with assignments to the
// list's own lengths instead. Every extra package is another thing that has to be
// in the offline bundle for a request to compile at runtime, and this is not
// worth the risk.
//
// `listWrap` takes *already escaped* LaTeX, not user text. Escaping happens in
// `bullets` and in the callers that build a compound item out of several escaped
// pieces -- doing it in one place is what stops a separator like `\textemdash{}`
// from being escaped into a literal backslash-and-t.
function listWrap(items) {
  const body = (Array.isArray(items) ? items : [])
    .filter(item => typeof item === 'string' && item.trim())
    .map(item => `  \\item ${item.trim()}`)
    .join('\n');
  if (!body) return '';
  return [
    '\\begin{list}{\\textbullet}{\\setlength{\\leftmargin}{4.5mm}\\setlength{\\labelwidth}{2mm}\\setlength{\\topsep}{0.6mm}\\setlength{\\itemsep}{0.4mm}\\setlength{\\parsep}{0pt}\\setlength{\\partopsep}{0pt}}',
    body,
    '\\end{list}'
  ].join('\n');
}

function bullets(lines) {
  return listWrap(
    lines.filter(line => typeof line === 'string' && line.trim()).map(line => tex(line.trim()))
  );
}

// A certification is several optional fields, so it is assembled from escaped
// pieces rather than passed to `tex` as one string.
function certificationItem(cert) {
  const head = [tex(cert.title), tex(cert.issuer)].filter(Boolean).join(EM_DASH);
  return cert.year ? `${head} (${tex(cert.year)})` : head;
}

// Jobs are "Title — Company" on one line with the dates right-aligned. A right
// edge needs a box, so this is where the width arithmetic lives: \hfill inside a
// paragraph with no box would just push the dates onto the next line.
function dateLine(dates, color) {
  if (!dates) return '';
  return `\\hfill{\\footnotesize\\color{${color}}${tex(dates)}}`;
}

function preamble(tpl, watermark) {
  // draftwatermark is loaded only when there is a watermark to draw. It is in the
  // offline bundle, but a free export should not load a package it does not use,
  // and its \SetWatermark* commands go after \begin{document}, which is where its
  // own documentation puts them.
  const markPackage = watermark ? '\\usepackage{draftwatermark}' : '';

  return `\\documentclass[${tpl.bodySize},a4paper]{article}
${CORE}
${tpl.fontPackages}
\\usepackage[margin=${tpl.margin}]{geometry}
${markPackage}
\\pagestyle{empty}
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{0pt}
\\renewcommand{\\labelitemi}{\\textbullet}
\\definecolor{cvheading}{HTML}{${tpl.headingColor}}
\\definecolor{cvrule}{HTML}{${tpl.ruleColor}}
\\definecolor{cvmuted}{HTML}{6B7280}
\\begin{document}`;
}

function watermarkBlock(watermark) {
  const text = tex(String(watermark || '').trim());
  if (!text) return '';
  // No \SetWatermarkHorCenter/\SetWatermarkVerCenter here. Combining either with
  // \SetWatermarkAngle makes draftwatermark fail to compile with "Illegal unit of
  // measure" -- verified against tectonic 0.17.0, where the angle alone works and
  // the angle plus a centre does not. The angled path already centres the mark, so
  // dropping the explicit centres loses nothing.
  return [
    `\\SetWatermarkText{${text}}`,
    '\\SetWatermarkScale{1}',
    '\\SetWatermarkColor[gray]{0.86}',
    '\\SetWatermarkAngle{38}'
  ].join('\n');
}

/**
 * Build a complete, compilable LaTeX document for a CV.
 *
 * Section order matches the pdfkit renderer, including the skills-first decision,
 * so a user switching engine does not get a document reorganised underneath them.
 *
 * @param {object} cv tailored CV content
 * @param {object} opts `{ template, language, coverLetter, watermark }`
 * @returns {string} LaTeX source
 */
function buildLatexDocument(cv, opts = {}) {
  const tpl = TEMPLATES[opts.template] || TEMPLATES['latex-classic'];
  const lang = opts.language === 'fr' ? 'fr' : 'en';
  const labels = LABELS[lang];
  const content = cv || {};
  const out = [];

  out.push(preamble(tpl, opts.watermark));

  const watermark = watermarkBlock(opts.watermark);
  if (watermark) out.push(watermark);

  // Header. The alignment is the template's, not fixed: `\begin{center}` adds
  // vertical space above and below, so a left-aligned template uses `\raggedright`
  // inside a group instead. Both are scoped so they cannot leak into the body.
  out.push('\\vspace*{-6mm}');
  out.push(tpl.nameAlign === 'left' ? '{\\raggedright' : '{\\centering');
  out.push(`\\color{cvheading}${tpl.nameSize}\\bfseries ${tex(content.name || '')}\\par`);
  if (content.headline) {
    out.push(`\\vspace{1mm}{\\color{cvmuted}\\itshape ${tex(content.headline)}\\par}`);
  }
  const contacts = contactLine(content);
  if (contacts) out.push(`\\vspace{1.5mm}{${tpl.contactSize}${contacts}\\par}`);
  out.push('}');
  out.push(`{\\color{cvrule}\\rule{\\textwidth}{0.6pt}\\par}`);
  out.push('\\vspace{1mm}');

  const skillsFirst = shouldSkillsFirst(content);

  const renderSkills = () => {
    if (!Array.isArray(content.skills) || !content.skills.length) return;
    out.push(heading(labels.skills.toUpperCase(), 'cvheading', 'cvrule', tpl));
    out.push(`${tex(content.skills.filter(Boolean).join(', '))}\\par`);
    out.push('\\vspace{0.8mm}');
  };

  if (content.summary) {
    out.push(heading(labels.summary.toUpperCase(), 'cvheading', 'cvrule', tpl));
    out.push(`${tex(content.summary)}\\par`);
    out.push('\\vspace{0.8mm}');
  }

  if (skillsFirst) renderSkills();

  if (Array.isArray(content.experience) && content.experience.length) {
    out.push(heading(labels.experience.toUpperCase(), 'cvheading', 'cvrule', tpl));
    content.experience.forEach((exp = {}) => {
      const head = [tex(exp.title || ''), exp.company ? tex(exp.company) : ''].filter(Boolean);
      if (head.length) out.push(`${roleLine(head, 'cvheading')}${dateLine(exp.dates, 'cvmuted')}\\par`);
      if (Array.isArray(exp.bullets) && exp.bullets.length) {
        out.push(bullets(exp.bullets));
      }
      out.push('\\vspace{1.2mm}');
    });
  }

  if (Array.isArray(content.education) && content.education.length) {
    out.push(heading(labels.education.toUpperCase(), 'cvheading', 'cvrule', tpl));
    content.education.forEach((edu = {}) => {
      const head = [tex(edu.degree || ''), edu.institution ? tex(edu.institution) : ''].filter(Boolean);
      if (head.length) out.push(`${roleLine(head, 'cvheading')}${dateLine(edu.dates, 'cvmuted')}\\par`);
      if (edu.details) out.push(`${tex(edu.details)}\\par`);
      out.push('\\vspace{1.2mm}');
    });
  }

  if (!skillsFirst) renderSkills();

  if (Array.isArray(content.certifications) && content.certifications.length) {
    out.push(heading(labels.certifications.toUpperCase(), 'cvheading', 'cvrule', tpl));
    out.push(listWrap(content.certifications.map(certificationItem)));
  }

  // An extra section's heading is user text, so it is uppercased *then* escaped.
  // Uppercasing after escaping would turn the backslash of `\_` into an uppercase
  // character and break the command.
  if (Array.isArray(content.additionalSections) && content.additionalSections.length) {
    content.additionalSections.forEach(section => {
      if (!section || !section.title) return;
      out.push(heading(tex(String(section.title).toUpperCase()), 'cvheading', 'cvrule', tpl));
      out.push(`${tex(section.content || '')}\\par`);
      out.push('\\vspace{0.8mm}');
    });
  }

  // The cover letter starts a fresh page, as in the pdfkit renderer.
  if (typeof opts.coverLetter === 'string' && opts.coverLetter.trim()) {
    out.push('\\newpage');
    out.push(heading(labels.coverLetter.toUpperCase(), 'cvheading', 'cvrule', tpl));
    opts.coverLetter
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .forEach(line => {
        out.push(`${tex(line)}\\par`);
        out.push('\\vspace{0.8mm}');
      });
  }

  out.push('\\end{document}');

  return out.filter(line => line !== '').join('\n');
}

function isLatexTemplate(name) {
  return Object.prototype.hasOwnProperty.call(TEMPLATES, name);
}

exports.buildLatexDocument = buildLatexDocument;
exports.isLatexTemplate = isLatexTemplate;
exports.tex = tex;
exports.LATEX_TEMPLATES = Object.keys(TEMPLATES);
