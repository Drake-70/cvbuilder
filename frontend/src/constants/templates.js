// Which templates exist, and which format can render them.
//
// This list used to be copied into three components by hand. It was also the
// source of the drift the server now has an opinion about: the LaTeX templates
// are PDF-only, so a component that renders the list without knowing the format
// would offer a LaTeX template to a .docx download and get a different document
// than the one that was picked.
//
// The authoritative list is the server's `GET /api/document/templates`, because
// whether the LaTeX templates are offered depends on whether the image has the
// engine. The constant below is the fallback for when that request has not landed
// (or failed), and it holds only the six pdfkit templates -- which is the safe
// subset, since those render on every build.

// Rendered by pdfkit, for both PDF and .docx.
export const PDFKIT_TEMPLATES = [
  'modern',
  'classic',
  'creative',
  'professional',
  'minimal',
  'bold'
];

// Rendered by LaTeX, PDF only. Listed here for the labels and so the LaTeX
// templates can be recognised (and excluded from .docx) without a round trip.
// Whether they are actually offered comes from the server.
export const LATEX_TEMPLATES = ['latex-classic', 'latex-compact'];

export const isLatexTemplate = (name) => LATEX_TEMPLATES.includes(name);

// Whether a template can be typeset by pdfkit, which is the only engine the
// .docx renderer uses.
export const isPdfkitTemplate = (name) => PDFKIT_TEMPLATES.includes(name);

// i18n key for a template's display name. Raw ids in the picker would read
// "latex-compact" to someone choosing a CV design.
export const templateLabelKey = (name) => `template_labels.${name}`;

/**
 * Which templates to offer for a format, given what the server said is available.
 *
 * `available` is the response from GET /api/document/templates, or null before it
 * arrives or if it failed. Either way the pdfkit six are always offered: they
 * render everywhere, and a picker that is briefly incomplete is better than one
 * that is empty on a failed request.
 *
 * The LaTeX templates are intersected with the server's list rather than used
 * directly, so a build without the engine never offers them.
 */
export function templatesForFormat(format, available) {
  if (format !== 'pdf') return PDFKIT_TEMPLATES;
  const serverPdf = available && Array.isArray(available.pdf) ? available.pdf : [];
  const latexOffered = LATEX_TEMPLATES.filter(name => serverPdf.includes(name));
  return [...PDFKIT_TEMPLATES, ...latexOffered];
}