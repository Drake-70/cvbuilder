const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  buildLatexDocument,
  isLatexTemplate,
  LATEX_TEMPLATES
} = require('../services/latexService');

const latexEngine = require('../services/latexEngine');
const pdfService = require('../services/pdfService');
const { shouldSkillsFirst } = require('../services/cvLayout');

const REPO = path.join(__dirname, '..', '..');
const WARMUP = path.join(REPO, 'docker', 'tectonic-warmup.tex');
const DOCKERFILE = path.join(REPO, 'Dockerfile');

// ---------------------------------------------------------------------------
// The offline package allow-list.
//
// This is not documentation, it is a finding. Each entry was compiled
// individually against tectonic 0.17.0 and either worked or did not. The list is
// short because tectonic ships a reduced TeX Live, and the surprising absences are
// the whole point:
//
//   helvet / tgheros / newtxsf  absent -- no sans-serif is available at all
//   lmodern / tgtermes          absent
//   cmsy, cmmi, cmr             absent (the maths and EC font metrics)
//
// Two consequences that are easy to reintroduce by accident:
//
//   * [T1]{fontenc} on its own fails with a fontconfig error, because Computer
//     Modern has no T1-encoded metrics in the bundle. fontenc must travel with
//     newtxtext, which supplies them.
//   * Anything in math mode fails at the xdvipdfmx stage with "Cannot proceed
//     without .vf or physical font for PDF output". A CV has no maths, so nothing
//     in the builder should ever enter math mode -- not even a `$\cdot$` separator,
//     which is what this list was originally written with.
const AVAILABLE_PACKAGES = [
  'fontenc',
  'inputenc',
  'textcomp',
  'newtxtext',
  'geometry',
  'xcolor',
  'hyperref',
  'draftwatermark',
  'fontspec'
];

const sampleCV = {
  name: 'Amelie Ndo',
  email: 'amelie@example.com',
  phone: '+237 6 99 88 77 66',
  location: 'Douala, Cameroun',
  nationality: 'Camerounaise',
  linkedin: 'www.linkedin.com/in/amelie',
  website: 'example.com/portfolio',
  headline: 'DevOps Engineer',
  summary: 'Five years of infrastructure work.',
  skills: ['Kubernetes', 'Go', 'Terraform'],
  experience: [
    {
      title: 'Platform Engineer',
      company: 'MTN Cameroun',
      dates: '2022 - present',
      bullets: ['Migrated 400 services to Kubernetes.', 'Cut deploy time from 45 min to 3.']
    }
  ],
  education: [{ degree: 'MSc Computer Science', institution: 'University of Yaounde I', dates: '2017 - 2019' }],
  certifications: [{ title: 'CKA', issuer: 'CNCF', year: '2023' }]
};

// Every \usepackage{name} in a document.
function packagesIn(tex) {
  const names = [];
  for (const match of tex.matchAll(/\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}/g)) {
    names.push(...match[1].split(',').map(n => n.trim()));
  }
  return names;
}

// Environments opened but never closed, which is how a syntax error happens.
function unbalancedEnvironments(tex) {
  const stack = [];
  for (const match of tex.matchAll(/\\(begin|end)\{([^}]+)\}/g)) {
    if (match[1] === 'begin') stack.push(match[2]);
    else if (stack.pop() !== match[2]) return match[2];
  }
  return stack.length ? stack[stack.length - 1] : null;
}

// An unescaped $, i.e. math mode, ignoring comments and already-escaped dollars.
//
// Comments have to go first because this file and the warm-up document both
// *discuss* the maths-mode failure using a literal "$...$", and a naive scan finds
// its own warning. They also name \SetWatermarkHorCenter to explain why it is not
// used, which is the same trap.
function stripComments(tex) {
  return tex.replace(/(^|[^\\])%[^\n]*/g, '$1');
}

function hasMathMode(tex) {
  return stripComments(tex).replace(/\\\$/g, '').includes('$');
}

// Mojibake: a UTF-8 byte sequence that was decoded as latin-1 somewhere and then
// re-encoded. It is invisible in a casual diff of the source but prints as garbage
// in the PDF, and it happened once already.
//
// The signature is always two characters standing in for one -- "é" arrives as "Ã©"
// -- because the two UTF-8 bytes were each read as a latin-1 code point. Matching
// the individual code points instead would flag the French labels themselves, since
// â is U+00E2 and Â is U+00C2. Hence the required follower.
const MOJIBAKE = /\u00C3[\u0080-\u00BF]|\u00C2[\u0080-\u00BF\u00A0\u20AC]|\u00E2\u20AC/;

describe('latexService: document structure', () => {
  test('produces a complete document for every template', () => {
    for (const template of LATEX_TEMPLATES) {
      const tex = buildLatexDocument(sampleCV, { template, language: 'en' });
      assert.ok(tex.startsWith('\\documentclass'), `${template} should start with \\documentclass`);
      assert.ok(tex.trimEnd().endsWith('\\end{document}'), `${template} should end with \\end{document}`);
      assert.match(tex, /\\begin\{document\}/, `${template} should open the document`);
      assert.equal(unbalancedEnvironments(tex), null, `${template} should have balanced environments`);
    }
  });

  test('never enters math mode', () => {
    // The Computer Modern maths fonts are not in the bundle, so a single math-mode
    // construct fails the compile at the PDF conversion step.
    for (const template of LATEX_TEMPLATES) {
      const tex = buildLatexDocument(sampleCV, { template, language: 'en' });
      assert.ok(!hasMathMode(tex), `${template} should contain no unescaped $`);
    }
  });

  test('emits no mis-encoded text', () => {
    // The French labels once shipped as "ExpÃ©rience" -- valid JS, invisible in a
    // casual diff, and printed verbatim into every French LaTeX CV. Anything in
    // the document that decodes as a UTF-8 sequence read through latin-1 shows up
    // here.
    for (const template of LATEX_TEMPLATES) {
      for (const language of ['en', 'fr']) {
        const tex = buildLatexDocument(sampleCV, { template, language });
        assert.ok(!MOJIBAKE.test(tex), `${template}/${language} produced mis-encoded text`);
      }
    }
  });

  test('compiles for an empty CV', () => {
    // A half-filled form must not produce a broken document.
    for (const template of LATEX_TEMPLATES) {
      const tex = buildLatexDocument({}, { template, language: 'en' });
      assert.ok(tex.startsWith('\\documentclass'));
      assert.equal(unbalancedEnvironments(tex), null);
    }
  });

  test('only loads packages the offline bundle carries', () => {
    for (const template of LATEX_TEMPLATES) {
      const tex = buildLatexDocument(sampleCV, { template, language: 'fr', watermark: 'PREVIEW' });
      for (const pkg of packagesIn(tex)) {
        assert.ok(
          AVAILABLE_PACKAGES.includes(pkg),
          `${pkg} is not in the verified-available list (template ${template})`
        );
      }
    }
  });

  test('every package the builder emits is warmed into the image cache', () => {
    // The runtime compiles with --only-cached, so a package the builder can emit
    // but the warm-up document does not load is a package that fails for the first
    // user who needs it -- with no network to fall back on.
    const warmup = fs.readFileSync(WARMUP, 'utf8');
    const warmed = new Set(packagesIn(warmup));
    assert.ok(warmed.size > 0, 'the warm-up document should load something');

    for (const template of LATEX_TEMPLATES) {
      const tex = buildLatexDocument(sampleCV, { template, language: 'en', watermark: 'PREVIEW' });
      for (const pkg of packagesIn(tex)) {
        assert.ok(warmed.has(pkg), `${pkg} is emitted by ${template} but missing from docker/tectonic-warmup.tex`);
      }
    }
  });

  test('uses a font size the bundle can load', () => {
    // size10.clo and friends are absent; only size11.clo is present.
    for (const template of LATEX_TEMPLATES) {
      const tex = buildLatexDocument(sampleCV, { template, language: 'en' });
      assert.match(tex, /\\documentclass\[11pt,a4paper\]/, `${template} should be 11pt`);
    }
  });

  test('every LaTeX template is serif, because no sans font exists in the bundle', () => {
    for (const template of LATEX_TEMPLATES) {
      const tex = buildLatexDocument(sampleCV, { template, language: 'en' });
      for (const sans of ['helvet', 'tgheros', 'newtxsf', 'sfdefault']) {
        assert.ok(!tex.includes(sans), `${template} should not reference ${sans}`);
      }
    }
  });
});

describe('latexService: escaping', () => {
  test('escapes every LaTeX metacharacter in CV text', () => {
    const tex = buildLatexDocument(
      { name: 'A&B', summary: '100% of $5 #1 _under_ {brace} ~tilde ^hat \\slash' },
      { template: 'latex-classic', language: 'en' }
    );
    assert.ok(tex.includes('A\\&B'), '& should be escaped');
    assert.ok(tex.includes('100\\%'), '% should be escaped');
    assert.ok(tex.includes('\\$5'), '$ should be escaped');
    assert.ok(tex.includes('\\#1'), '# should be escaped');
    assert.ok(tex.includes('\\_under\\_'), '_ should be escaped');
    assert.ok(tex.includes('\\{brace\\}'), 'braces should be escaped');
    assert.ok(tex.includes('\\~{}tilde') || tex.includes('\\textasciitilde{}'), '~ should be escaped');
    assert.ok(tex.includes('\\^{}hat') || tex.includes('\\textasciicircum{}'), '^ should be escaped');
    assert.ok(tex.includes('\\textbackslash{}'), 'backslash should be escaped');
  });

  test('escapes the backslash exactly once', () => {
    // Escaping order matters: if the backslash were escaped after the other
    // metacharacters, its own replacements (which contain backslashes) would be
    // escaped again and produce "\textbackslash{}textbackslash{}".
    const backslash = String.fromCharCode(92);
    const tex = buildLatexDocument(
      { name: `C:${backslash}Users${backslash}amelie` },
      { template: 'latex-classic' }
    );
    assert.ok(!tex.includes('textbackslash{}textbackslash{}'), 'no double-escaped backslashes');
    assert.equal((tex.match(/textbackslash\{\}/g) || []).length, 2, 'two backslashes, two escapes');
  });

  test('escapes \\href bodies separately', () => {
    // Inside \href the argument is a URL, where a bare & or % means something other
    // than it does in document text, so it needs its own escaping.
    const tex = buildLatexDocument(
      { website: 'https://ex.com/a%20b?x=1&y=2#frag' },
      { template: 'latex-classic' }
    );
    const href = tex.match(/\\href\{([^}]*)\}/);
    assert.ok(href, 'expected a \\href for the website');
    // "Bare" means not preceded by a backslash: the escaped form still contains the
    // character, it just also contains a backslash.
    assert.ok(!href[1].replace(/\\%/g, '').includes('%'), 'a bare % would start a comment and eat the rest of the line');
    assert.ok(href[1].includes('\\%20'), 'the % should be escaped, and stay adjacent to its digits');
    assert.ok(!href[1].replace(/\\#/g, '').includes('#'), 'a bare # is a macro parameter character');
    assert.ok(href[1].includes('\\#'), 'the # should be escaped');

    // about a bare & being left alone on purpose. It is not special to the TeX reader
    // outside an alignment, and both spellings were compiled with tectonic 0.17.0
    // and the link annotation read back out of each PDF: \href with \& and \href
    // with a bare & both yield the identical /URI, because hyperref applies
    // \dospecials when normalising the URL and drops the backslash again. So
    // escaping it would change nothing in the output.
    assert.ok(href[1].includes('&'), 'the query separator should survive into the link');
  });

  test('adds a scheme to a bare www. host', () => {
    const tex = buildLatexDocument({ linkedin: 'www.linkedin.com/in/x' }, { template: 'latex-classic' });
    assert.ok(tex.includes('\\href{https://www.linkedin.com/in/x}'), 'expected https:// prepended');
  });

  test('escapes a custom section title after uppercasing', () => {
    // Uppercasing after escaping would turn the backslash of "\_" into an uppercase
    // character and break the command.
    const tex = buildLatexDocument(
      { additionalSections: [{ title: 'langues &_autres', content: 'ok' }] },
      { template: 'latex-classic', language: 'en' }
    );
    assert.ok(tex.includes('LANGUES \\&\\_AUTRES'), `expected escaped uppercase title in:\n${tex.slice(0, 400)}`);
  });

  test('joins a job title and company with an em dash, not an escaped one', () => {
    // A separator injected before escaping comes back as literal backslash-and-t.
    const tex = buildLatexDocument(
      { experience: [{ title: 'Engineer', company: 'MTN', dates: '2024', bullets: ['x'] }] },
      { template: 'latex-classic' }
    );
    assert.ok(tex.includes('Engineer \\textemdash{} MTN'), 'expected \\textemdash{} between title and company');
    assert.ok(!tex.includes('textbackslash{}textemdash'), 'the em dash must not be escaped');
  });

  test('keeps the section separators in text mode', () => {
    // "$\cdot$" was the original separator and pulled in the maths fonts.
    const tex = buildLatexDocument(sampleCV, { template: 'latex-classic' });
    assert.ok(tex.includes('\\textperiodcentered{}'), 'expected a text-mode middot');
    assert.ok(!tex.includes('\\cdot'), 'must not use \\cdot');
  });
});

describe('latexService: layout parity with the pdfkit renderer', () => {
  test('puts skills first when the layout says so', () => {
    const cv = {
      summary: 'A summary.',
      skills: ['Go', 'Kubernetes'],
      experience: [{ title: 'Dev', company: 'MTN', dates: '2024', bullets: ['x'] }]
    };
    assert.equal(shouldSkillsFirst(cv), true, 'precondition: shouldSkillsFirst wants skills first');

    const tex = buildLatexDocument(cv, { template: 'latex-classic', language: 'en' });
    const skillsAt = tex.search(/SKILLS/);
    const experienceAt = tex.search(/EXPERIENCE/);
    assert.ok(skillsAt > 0 && experienceAt > 0, 'both sections should be present');
    assert.ok(skillsAt < experienceAt, 'skills should come first, matching the pdfkit renderer');
  });

  test('puts skills after experience otherwise', () => {
    // shouldSkillsFirst keys off the estimated years in the date strings, not off
    // anything about the summary. Six years is past the threshold.
    const cv = {
      summary: 'A summary.',
      skills: ['Go', 'Kubernetes', 'Terraform'],
      experience: [{ title: 'Dev', company: 'MTN', dates: '2018 - 2024', bullets: ['x'] }]
    };
    assert.equal(shouldSkillsFirst(cv), false, 'precondition: six years is not "early career"');

    const tex = buildLatexDocument(cv, { template: 'latex-classic', language: 'en' });
    assert.ok(tex.search(/SKILLS/) > tex.search(/EXPERIENCE/), 'skills should follow experience');
  });
});

describe('latexService: locales', () => {
  test('uses French labels for a French document', () => {
    const tex = buildLatexDocument(sampleCV, { template: 'latex-classic', language: 'fr' });
    assert.ok(tex.includes('EXP\u00C9RIENCE'), 'French experience is uppercased with its accent');
    assert.ok(tex.includes('FORMATION'), 'expected the French education label');
    assert.ok(tex.includes('COMP\u00C9TENCES'), 'expected the French skills label');
    assert.ok(!tex.includes('EDUCATION'), 'should not use the English education label');
    assert.ok(!tex.includes('PROFESSIONAL'), 'should not use the English summary label');
  });

  test('uppercases accented labels without losing the accent', () => {
    // Uppercasing in JavaScript gives \u00C9; toUpperCase in TeX needs the font to
    // have the glyph, and uppercasing in the shell would mojibake the source.
    const tex = buildLatexDocument(sampleCV, { template: 'latex-classic', language: 'fr' });
    assert.ok(!tex.includes('MakeUppercase'), 'should not defer uppercasing to TeX');
    assert.ok(!MOJIBAKE.test(tex), 'the accents must survive as UTF-8');
  });

  test('uppercases section labels in JavaScript, not with \\MakeUppercase', () => {
    // Uppercasing in JS means the PDF string matches the locale string and the
    // behaviour is testable without a compiler.
    const tex = buildLatexDocument(sampleCV, { template: 'latex-classic', language: 'en' });
    assert.ok(!tex.includes('MakeUppercase'), 'should not defer uppercasing to TeX');
    assert.ok(tex.includes('CERTIFICATIONS'), 'expected an uppercased label');
  });
});

describe('latexService: templates', () => {
  test('exposes exactly the two serif templates', () => {
    assert.deepEqual([...LATEX_TEMPLATES], ['latex-classic', 'latex-compact']);
  });

  test('isLatexTemplate distinguishes the two families', () => {
    for (const name of LATEX_TEMPLATES) assert.equal(isLatexTemplate(name), true, name);
    for (const name of pdfService.PDF_TEMPLATES) assert.equal(isLatexTemplate(name), false, name);
    assert.equal(isLatexTemplate('nonsense'), false);
  });

  test('honours each template\'s own alignment and rules', () => {
    const classic = buildLatexDocument(sampleCV, { template: 'latex-classic' });
    const compact = buildLatexDocument(sampleCV, { template: 'latex-compact' });
    assert.ok(classic.includes('{\\centering'), 'classic should centre its header');
    assert.ok(compact.includes('{\\raggedright'), 'compact should left-align its header');
    assert.ok(classic.includes('\\rule{\\linewidth}{0.4pt}'), 'classic draws rules');
    assert.ok(!compact.includes('\\rule{\\linewidth}{0.4pt}'), 'compact draws none');
  });

  test('the compact template is the denser one', () => {
    const classic = buildLatexDocument(sampleCV, { template: 'latex-classic' });
    const compact = buildLatexDocument(sampleCV, { template: 'latex-compact' });
    assert.ok(compact.includes('margin=14mm') && classic.includes('margin=18mm'), 'compact has tighter margins');
  });
});

describe('latexService: watermark', () => {
  test('is absent when no watermark is requested', () => {
    const tex = buildLatexDocument(sampleCV, { template: 'latex-classic' });
    assert.ok(!tex.includes('draftwatermark'), 'no package');
    assert.ok(!tex.includes('SetWatermark'), 'no commands');
  });

  test('is present and escaped when requested', () => {
    const tex = buildLatexDocument(sampleCV, { template: 'latex-classic', watermark: 'APERÇU & CO' });
    assert.ok(tex.includes('\\usepackage{draftwatermark}'), 'loads the package');
    assert.ok(tex.includes('\\SetWatermarkText{APERÇU \\& CO}'), 'escapes the label');
    assert.ok(tex.includes('\\SetWatermarkAngle{38}'), 'matches the diagonal pdfkit watermark');
  });

  test('never pairs the angle with an explicit centre', () => {
    // draftwatermark fails to compile with "Illegal unit of measure" when
    // \SetWatermarkAngle is combined with \SetWatermarkHorCenter or
    // \SetWatermarkVerCenter. Verified against tectonic 0.17.0.
    const tex = buildLatexDocument(sampleCV, { template: 'latex-classic', watermark: 'PREVIEW' });
    assert.ok(tex.includes('\\SetWatermarkAngle'), 'the angle is wanted');
    assert.ok(!tex.includes('SetWatermarkHorCenter'), 'HorCenter must not be emitted');
    assert.ok(!tex.includes('SetWatermarkVerCenter'), 'VerCenter must not be emitted');
  });

  test('the warm-up document avoids the same broken combination', () => {
    // Otherwise the image build warms a cache for a document that cannot compile.
    const warmup = fs.readFileSync(WARMUP, 'utf8');
    const warmupCode = stripComments(warmup);
    assert.ok(!warmupCode.includes('SetWatermarkHorCenter'), 'warm-up must not use HorCenter');
    assert.ok(!warmupCode.includes('SetWatermarkVerCenter'), 'warm-up must not use VerCenter');
    assert.equal(unbalancedEnvironments(warmup), null, 'the warm-up document must be balanced');
    assert.ok(!hasMathMode(warmup), 'the warm-up document must stay out of math mode');
    assert.ok(!MOJIBAKE.test(warmup), 'the warm-up document must be valid UTF-8');
  });
});

describe('latexEngine: availability', () => {
  test('reports unavailable without throwing when the engine is absent', () => {
    // No engine is installed in the test environment, which is the same state as a
    // dev machine or a container built before this feature.
    assert.equal(typeof latexEngine.isAvailable(), 'boolean');
    assert.doesNotThrow(() => latexEngine.isAvailable());
  });

  test('caches the probe', () => {
    assert.equal(latexEngine.isAvailable(), latexEngine.isAvailable());
  });

  test('wraps every failure with .latex so the caller can fall back', async () => {
    // compile() has to signal "use pdfkit instead" in a way the caller can test,
    // because on a build without the engine this is the only path.
    assert.throws(
      () => latexEngine.compile('\\documentclass{article}\\begin{document}x\\end{document}'),
      (err) => err.latex === true && typeof err.code === 'string'
    );
  });

  test('leaves no .tex behind, even when the compile fails', () => {
    const before = fs.readdirSync(require('os').tmpdir()).filter(n => n.startsWith('cv-latex-'));
    try {
      latexEngine.compile('\\documentclass{article}\\begin{document}x\\end{document}');
    } catch {
      // expected
    }
    const after = fs.readdirSync(require('os').tmpdir()).filter(n => n.startsWith('cv-latex-'));
    assert.deepEqual(after, before, 'the temp directory should be removed on every path');
  });
});

describe('pdfService: template availability and fallback', () => {
  test('hides the LaTeX templates when the engine is unavailable', () => {
    const available = pdfService.availablePdfTemplates();
    assert.equal(available.engine, null, 'precondition: no engine in this environment');
    for (const name of LATEX_TEMPLATES) {
      assert.ok(!available.pdf.includes(name), `${name} should be hidden`);
    }
    assert.deepEqual(available.docx, [...pdfService.PDF_TEMPLATES], 'docx is unaffected');
  });

  test('always offers the six pdfkit templates', () => {
    const { pdf, docx } = pdfService.availablePdfTemplates();
    assert.equal(pdf.length, 6);
    assert.equal(docx.length, 6);
  });

  test('isTemplateValidFor separates format compatibility from deployment state', () => {
    // A LaTeX template is a valid *PDF* template even when the engine is missing,
    // because generatePdf falls back to its pdfkit counterpart. Rejecting it here
    // would turn an existing document's download into a 400.
    for (const name of LATEX_TEMPLATES) {
      assert.equal(pdfService.isTemplateValidFor('pdf', name), true, `${name} is a valid pdf template`);
    }
    // It is never a valid .docx template: there is no LaTeX in the docx path.
    for (const name of LATEX_TEMPLATES) {
      assert.equal(pdfService.isTemplateValidFor('docx', name), false, `${name} is not a docx template`);
    }
    for (const name of pdfService.PDF_TEMPLATES) {
      assert.equal(pdfService.isTemplateValidFor('pdf', name), true);
      assert.equal(pdfService.isTemplateValidFor('docx', name), true);
    }
    for (const bad of ['', null, undefined, 'nonsense', 'toString', '__proto__']) {
      assert.equal(pdfService.isTemplateValidFor('pdf', bad), false, `${String(bad)} should be invalid`);
    }
  });

  test('returns a valid PDF for a LaTeX template by falling back to pdfkit', async () => {
    // This is the path that runs on any build without the engine, so it is the one
    // that must not regress. The user always gets a document.
    for (const template of LATEX_TEMPLATES) {
      const buffer = await pdfService.generatePdf(sampleCV, 'Dear Sir or Madam', 'en', template, 'PREVIEW');
      assert.ok(buffer.length > 0, `${template} should produce a document`);
      assert.equal(buffer.subarray(0, 5).toString('latin1'), '%PDF-', `${template} should be a PDF`);
    }
  });

  test('leaves the pdfkit templates untouched', async () => {
    const buffer = await pdfService.generatePdf(sampleCV, '', 'en', 'classic');
    assert.equal(buffer.subarray(0, 5).toString('latin1'), '%PDF-');
  });
});

describe('routes: the template capability endpoint', () => {
  const routes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'document.js'), 'utf8');

  test('is registered before the :id route', () => {
    // Express matches in declaration order. Registered after `/:id`, this would be
    // captured as a document id of "templates" and 404 for the wrong reason.
    const templatesAt = routes.indexOf("router.get('/templates'");
    const idAt = routes.indexOf("router.get('/:id'");
    assert.ok(templatesAt > 0, 'the /templates route should exist');
    assert.ok(idAt > 0, 'the /:id route should exist');
    assert.ok(templatesAt < idAt, '/templates must be declared before /:id');
  });

  test('is behind auth', () => {
    const line = routes.split('\n').find(l => l.includes("router.get('/templates'"));
    assert.match(line, /requireAuth/, 'the endpoint should require authentication');
  });

  test('no route serves LaTeX source', () => {
    // The generated .tex holds the whole CV and inherits the download route's
    // privacy properties, so it must not be reachable.
    const routeFile = routes;
    assert.ok(!/\.tex['"`)]/.test(routeFile), 'no route should reference a .tex file');
    const controller = fs.readFileSync(
      path.join(__dirname, '..', 'controllers', 'documentController.js'),
      'utf8'
    );
    assert.ok(!controller.includes('\\end{document}'), 'the controller should never build LaTeX itself');
    assert.ok(!/res\.(send|json)\(\s*tex/i.test(controller), 'no raw LaTeX in a response');
  });
});

describe('Dockerfile: the engine is installed reproducibly', () => {
  const dockerfile = fs.readFileSync(DOCKERFILE, 'utf8');

  test('points the bundle cache at a fixed directory tectonic resolves', () => {
    // tectonic resolves its cache via TECTONIC_CACHE_DIR (used verbatim, only the
    // "bundles" subdirectory appended) or, failing that, $XDG_CACHE_HOME through the
    // `directories` crate, which inserts an extra "Tectonic" component. Both are set
    // to the same root so the cache lands under /opt/tectonic whichever applies, and
    // so the single COPY below captures it.
    assert.ok(dockerfile.includes('ENV TECTONIC_CACHE_DIR=/opt/tectonic'), 'should set TECTONIC_CACHE_DIR');
    assert.ok(dockerfile.includes('ENV XDG_CACHE_HOME=/opt/tectonic'), 'should also set XDG_CACHE_HOME');
  });

  test('asks tectonic where the bundle is instead of guessing', () => {
    // The build failed once on exactly this: the bundle landed one level deeper than
    // the assertion expected, so a successful compile exited non-zero. Reading the
    // resolved path back from the binary cannot drift with a version bump.
    assert.match(
      dockerfile,
      /tectonic -X show user-cache-dir/,
      'should query the cache path from tectonic'
    );
    assert.ok(
      !/test -d \/opt\/tectonic\/bundles/.test(dockerfile),
      'should not assert a hardcoded bundle path'
    );
  });

  test('proves the warm-up by recompiling offline, not by testing the directory', () => {
    // Resolving the cache dir creates it (get_user_cache_dir calls create_dir_all), so
    // `test -d` on the reported path passes even when the bundle is empty -- it would
    // green-light exactly the failure it is meant to catch. Recompiling with the
    // runtime's own flags cannot be faked: with the network forbidden it succeeds
    // only if every needed package is genuinely cached.
    // Matched as one literal rather than flag by flag: those flags also appear in the
    // comments above it, and a per-flag indexOf finds the prose, not the command.
    const at = dockerfile.indexOf(
      '/usr/local/bin/tectonic -X compile --outfmt pdf --only-cached --untrusted'
    );
    assert.ok(at > 0, 'the warm-up should recompile offline with the runtime flag set');

    // Must come after the warming compile, and its output must be checked, or the
    // second command is decoration.
    const warmingAt = dockerfile.indexOf('--outdir /tmp/warmup-out --outfmt pdf');
    assert.ok(warmingAt > 0, 'should warm the bundle first');
    assert.ok(warmingAt < at, 'the offline proof must follow the warming compile');
    assert.ok(
      dockerfile.slice(at).includes('test -s /tmp/warmup-cached-out/warmup.pdf'),
      'the offline recompile output should be asserted'
    );
    assert.ok(
      dockerfile.includes('mkdir -p /tmp/warmup-out /tmp/warmup-cached-out'),
      'both outdirs must be created; tectonic errors on a missing one'
    );
  });

  test('sets the same cache location in the production stage', () => {
    // The runtime resolves the bundle through these variables; if they differ from
    // the latex stage, --only-cached cannot find the pre-warmed cache.
    const productionAt = dockerfile.indexOf('AS production');
    assert.ok(productionAt > 0, 'should have a production stage');
    const production = dockerfile.slice(productionAt);
    assert.ok(
      production.includes('ENV TECTONIC_CACHE_DIR=/opt/tectonic'),
      'production should set TECTONIC_CACHE_DIR'
    );
    assert.ok(
      production.includes('ENV XDG_CACHE_HOME=/opt/tectonic'),
      'production should set XDG_CACHE_HOME'
    );
  });

  test('verifies the release digest', () => {
    // A build that fetches a binary should not be one compromised mirror away from
    // running arbitrary code in the production image.
    assert.match(dockerfile, /sha256sum -c -/, 'should verify the download');
    assert.match(dockerfile, /ARG TECTONIC_SHA256=[0-9a-f]{64}/, 'should pin the digest');
  });

  test('creates the outdir before passing it to tectonic', () => {
    // tectonic does not create --outdir; it errors if the directory is missing,
    // which would fail the image build on the warm-up step.
    const mkdirAt = dockerfile.indexOf('mkdir -p /tmp/warmup-out');
    const compileAt = dockerfile.indexOf('/usr/local/bin/tectonic -X compile --outdir');
    assert.ok(mkdirAt > 0, 'should mkdir the warm-up outdir');
    assert.ok(compileAt > 0, 'should run a warm-up compile');
    assert.ok(mkdirAt < compileAt, 'mkdir must come before the compile');
  });

  test('warms the cache on every package the templates need', () => {
    const warmup = fs.readFileSync(WARMUP, 'utf8');
    for (const pkg of ['fontenc', 'newtxtext', 'geometry', 'xcolor', 'hyperref', 'draftwatermark']) {
      assert.ok(packagesIn(warmup).includes(pkg), `warm-up should load ${pkg}`);
    }
  });

  test('copies the engine and its cache into the production image', () => {
    assert.match(dockerfile, /COPY --from=latex \/usr\/local\/bin\/tectonic/);
    assert.match(dockerfile, /COPY --from=latex \/opt\/tectonic/);
  });

  test('still builds without the engine layer', () => {
    // The fallback is the reason the feature is safe to ship: if the engine layer
    // is dropped, PDF export keeps working through pdfkit.
    assert.ok(
      dockerfile.includes('COPY --from=base /app/backend'),
      'the production image still gets the backend'
    );
  });
});

describe('frontend: the template list is asked of the server', () => {
  const src = path.join(REPO, 'frontend', 'src');

  test('offers the LaTeX templates for PDF only', async () => {
    const { templatesForFormat, PDFKIT_TEMPLATES, LATEX_TEMPLATES } = await import(
      `file:///${path.join(src, 'constants', 'templates.js').replace(/\\/g, '/')}`
    );
    const server = { pdf: [...PDFKIT_TEMPLATES, ...LATEX_TEMPLATES], docx: PDFKIT_TEMPLATES };

    const pdf = templatesForFormat('pdf', server);
    assert.deepEqual(pdf, [...PDFKIT_TEMPLATES, ...LATEX_TEMPLATES]);

    // .docx has no LaTeX renderer, so the list must not grow there regardless of
    // what the server said.
    assert.deepEqual(templatesForFormat('docx', server), [...PDFKIT_TEMPLATES]);
  });

  test('falls back to the six pdfkit templates when the server says nothing', async () => {
    const { templatesForFormat, PDFKIT_TEMPLATES, LATEX_TEMPLATES } = await import(
      `file:///${path.join(src, 'constants', 'templates.js').replace(/\\/g, '/')}`
    );
    for (const available of [null, undefined, {}, { pdf: null }]) {
      assert.deepEqual(templatesForFormat('pdf', available), [...PDFKIT_TEMPLATES], JSON.stringify(available));
      assert.deepEqual(templatesForFormat('docx', available), [...PDFKIT_TEMPLATES]);
    }
    assert.ok(LATEX_TEMPLATES.length > 0, 'the LaTeX names still exist for labelling');
  });

  test('does not offer a LaTeX template the server left out', async () => {
    const { templatesForFormat, PDFKIT_TEMPLATES } = await import(
      `file:///${path.join(src, 'constants', 'templates.js').replace(/\\/g, '/')}`
    );
    // A build without the engine: the pdf list is just the pdfkit six.
    const available = { pdf: [...PDFKIT_TEMPLATES], docx: PDFKIT_TEMPLATES };
    assert.deepEqual(templatesForFormat('pdf', available), [...PDFKIT_TEMPLATES]);
  });

  test('no component keeps its own hardcoded copy of the list', () => {
    // The list used to be duplicated in three components, which is how the LaTeX
    // templates would have leaked into the .docx path unnoticed.
    const components = ['components/ResultStep.jsx', 'pages/DocumentDetailPage.jsx', 'components/CVPreview.jsx'];
    for (const rel of components) {
      const source = fs.readFileSync(path.join(src, rel), 'utf8');
      assert.ok(
        !/\['modern',\s*'classic',\s*'creative'/.test(source),
        `${rel} still hardcodes the template list`
      );
      assert.ok(
        source.includes('constants/templates'),
        `${rel} should take the list from the shared constant`
      );
    }
  });

  test('the picker asks the server once and resets an incompatible template', () => {
    const hook = fs.readFileSync(path.join(src, 'hooks', 'useTemplates.js'), 'utf8');
    assert.ok(hook.includes("'/document/templates'"), 'should call the endpoint');

    const resultStep = fs.readFileSync(path.join(src, 'components', 'ResultStep.jsx'), 'utf8');
    assert.ok(
      /if \(!next\.includes\(template\)\) setTemplate/.test(resultStep),
      'switching format should clear a template the new format cannot render'
    );
  });
});

describe('frontend: locales', () => {
  const locales = path.join(REPO, 'frontend', 'src', 'locales');
  const names = ['modern', 'classic', 'creative', 'professional', 'minimal', 'bold', 'latex-classic', 'latex-compact'];

  for (const lang of ['en', 'fr']) {
    test(`${lang} has a label for every template`, () => {
      const json = JSON.parse(fs.readFileSync(path.join(locales, lang, 'tailor.json'), 'utf8'));
      assert.ok(json.template_labels, 'template_labels should exist');
      for (const name of names) {
        assert.ok(json.template_labels[name], `${lang} is missing template_labels.${name}`);
      }
      assert.ok(json.latex_preview_hint, `${lang} is missing latex_preview_hint`);
    });
  }

  test('en and fr cover the same template keys', () => {
    const en = JSON.parse(fs.readFileSync(path.join(locales, 'en', 'tailor.json'), 'utf8')).template_labels;
    const fr = JSON.parse(fs.readFileSync(path.join(locales, 'fr', 'tailor.json'), 'utf8')).template_labels;
    assert.deepEqual(Object.keys(en).sort(), Object.keys(fr).sort());
  });
});