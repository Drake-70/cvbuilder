// Job-description-independent resume quality scoring.
//
// Deliberately split from computeATSScore in scoreService.js. That function
// answers "how well does this CV match THIS job", which is unanswerable without
// a job description -- and scoreController 400s without one, so a user who took
// the "skip job description" path got no score at all. This one answers "is this
// CV any good at all", and every check below runs on a bare CV with no job
// context.
//
// Three properties worth keeping:
//
// 1. Findings are stable codes, not sentences. This app ships EN and FR and the
//    scorer has no idea which is active, so anything it emitted as prose would
//    be permanently untranslated. The frontend owns the wording; `params` carries
//    the numbers it needs to interpolate.
// 2. Pure computation over text already in memory. No AI call, no network, no
//    per-request cost. It can therefore never be the reason a request fails.
// 3. A missing input scores as zero, never as a crash. A CV with no education
//    section has no education section; that is a finding, not an error.

// Each category's `max` sums to 100. Order is the display order.
const CATEGORIES = [
  { key: 'contact', max: 10 },
  { key: 'structure', max: 25 },
  { key: 'impact', max: 25 },
  { key: 'verbs', max: 15 },
  { key: 'brevity', max: 15 },
  { key: 'language', max: 10 }
];

const WEAK_VERBS = new Set([
  'responsible', 'helped', 'worked', 'assisted', 'participated', 'involved',
  'handled', 'dealt', 'tasked', 'duties', 'various', 'miscellaneous'
]);

const STRONG_VERBS = new Set([
  // EN
  'accelerated', 'accomplished', 'achieved', 'administered', 'analysed', 'analyzed',
  'architected', 'audited', 'automated', 'benchmarked', 'built', 'collaborated',
  'conducted', 'configured', 'consolidated', 'constructed', 'converted',
  'coordinated', 'created', 'cut', 'decreased', 'delivered', 'deployed',
  'designed', 'developed', 'devised', 'diagnosed', 'directed', 'drove',
  'eliminated', 'enabled', 'engineered', 'enhanced', 'established', 'evaluated',
  'executed', 'expanded', 'facilitated', 'founded', 'generated', 'grew', 'guided',
  'halved', 'identified', 'implemented', 'improved', 'increased', 'instituted',
  'integrated', 'introduced', 'launched', 'led', 'leveraged', 'maintained',
  'managed', 'mentored', 'migrated', 'modernised', 'modernized', 'negotiated',
  'operated', 'optimised', 'optimized', 'orchestrated', 'overhauled', 'owned',
  'performed', 'pioneered', 'planned', 'prepared', 'produced', 'programmed',
  'prototyped', 'reduced', 'refactored', 'resolved', 'restructured', 'revamped',
  'saved', 'scaled', 'secured', 'shipped', 'spearheaded', 'standardised',
  'standardized', 'streamlined', 'strengthened', 'supervised', 'supported',
  'tested', 'trained', 'transformed', 'unified', 'upgraded', 'validated', 'won',
  // FR -- the product is bilingual, so a francophone CV must not be scored as
  // though it had no action verbs at all.
  'accéléré', 'accompli', 'administré', 'analysé', 'architecturé', 'audité',
  'automatisé', 'conçu', 'construit', 'coordonné', 'créé', 'déployé',
  'développé', 'diagnostiqué', 'dirigé', 'divisé', 'éliminé', 'encadré',
  'formé', 'géré', 'guidé', 'identifié', 'implémenté', 'lancé',
  'maintenu', 'maîtrisé', 'migré', 'négocié', 'optimisé', 'organisé',
  'orchestré', 'piloté', 'planifié', 'préparé', 'produit', 'réduit', 'réformé',
  'renforcé', 'réglé', 'résolu', 'restructuré', 'sécurisé', 'standardisé',
  'structuré', 'supervisé', 'transformé', 'unifié', 'validé'
]);

// Every repetition below is bounded on purpose.
//
// These two patterns were originally unbounded and took 5.6 SECONDS on a 50KB
// input: `[a-z0-9._%+-]+@` on a long run of letters with no '@' backtracks
// quadratically, and a pasted CV paragraph is precisely a long run of letters.
// An unbounded `[a-z0-9._%+-]+@` is a denial-of-service vector on a public
// endpoint that takes user-pasted text, so the quantifiers are capped at the
// longest real-world value. There is a timing test guarding this.
const EMAIL_RE = /[a-z0-9._%+-]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,24}/i;
// Deliberately permissive. Cameroon numbers are written every way imaginable
// (6 99 88 77 66, +237 6 99 88 77 66, 699887766) and a scorer that reports
// "no phone number" on a CV that has one is worse than useless -- it teaches
// users to ignore the report. The upper bound is 20 digits, past any real number
// and short enough that the run cannot blow up.
const PHONE_RE = /\+?\d[\d\s().-]{6,20}\d/;
const LINKEDIN_RE = /linkedin\.com\/(?:in|pub)\/[\w-]{1,64}/i;

function normalize(text) {
  // Only strings carry CV content. Without the typeof guard, String({}) yields
  // '[object Object]', which is then scored as a perfectly well-formed 2-word
  // sentence and earns the full readability marks -- so a caller passing an
  // object by mistake scored 10/100 on prose quality instead of 0.
  if (typeof text !== 'string') return '';
  return text.replace(/\r\n?/g, '\n');
}

// Units for the readability check.
//
// These two line kinds need opposite handling, which is the whole subtlety here:
// a bullet list is one short unit per line, and its lines often carry no
// terminal punctuation, so it must NOT be joined into paragraphs. A summary
// paragraph is one long unit wrapped across several lines, so it MUST be joined
// -- otherwise a 90-word run-on sentence is measured as four comfortable
// 22-word sentences and passes a check designed to catch exactly that.
function splitSentences(text) {
  const lines = normalize(text).split(/\n+/).map(l => l.trim()).filter(Boolean);
  const sentences = [];
  let prose = [];

  const flush = () => {
    if (!prose.length) return;
    prose.join(' ')
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(Boolean)
      .forEach(s => sentences.push(s));
    prose = [];
  };

  for (const line of lines) {
    if (BULLET_MARKER.test(line)) {
      flush();
      // A bullet is judged as a single unit: strip the marker and keep it whole.
      sentences.push(stripBulletMarker(line));
    } else {
      prose.push(line);
    }
  }
  flush();

  return sentences;
}

function wordCount(text) {
  const t = normalize(text).trim();
  return t ? t.split(/\s+/).filter(Boolean).length : 0;
}

const BULLET_MARKER = /^\s*[-*\u2022\u2023\u25AA\u25CF\u00B7\u2013\u2014>#]|\s*\d{1,2}[.)]\s/;

// Only these sections can contain achievement statements worth measuring.
// Education entries and skill lists cannot, and sweeping them in drags both the
// impact and the verb ratios down.
const ACHIEVEMENT_SECTIONS = [
  /experience|employment|\bexp\b|exp[ée]rience|parcours|career|work history/i,
  /achievement|accomplish|acquis|distinction|award/i,
  /project|projet|portfolio/i,
  /responsibilit/i,
  /activit[ée]|activity|volunteer|benevol/i
];

// Headings that end an achievement section. Matching one of these switches the
// section off; a heading matching nothing relevant leaves the state alone, so a
// role title ("Senior Backend Engineer - Korrigo Ltd") is not mistaken for the
// start of an unrelated section.
const NON_ACHIEVEMENT_SECTIONS = [
  /education|academic|formation|[ée]tudes|dipl[oô]mes|degree/i,
  /skill|comp[ée]tenc|expertise|technical|language|langue|interest|loisir/i,
  /certificat|licen[cs]e|training|formation professionnelle/i,
  /summary|r[ée]sum[ée]|profil|objectif|about/i,
  /reference|r[ée]f[ée]rence|contact|personal information|personal details/i
];

const HEADING_MAX_WORDS = 6;

function stripBulletMarker(line) {
  return line
    .replace(/^\s*[-*\u2022\u2023\u25AA\u25CF\u00B7\u2013\u2014>#]+\s*/, '')
    .replace(/^\s*\d{1,2}[.)]\s+/, '')
    .trim();
}

// A heading is a short label with no sentence punctuation. "EXPERIENCE",
// "WORK EXPERIENCE", "FORMATION" qualify; "Reduced latency by 40%." does not.
function isHeading(line) {
  const t = stripBulletMarker(line);
  if (!t || BULLET_MARKER.test(line)) return false;
  if (/[.:;,]$/.test(t)) return false;
  if (t.split(/\s+/).length > HEADING_MAX_WORDS) return false;
  // A heading is a label, not a clause.
  return !/\b(is|are|was|were|managed|led|built|developed|responsible|worked)\b/i.test(t);
}

// Bullets are found by section, not by length. An earlier version treated any
// line over 25 characters as a bullet, which swept in the contact line, the
// summary, every job title and the education entry. On a well-written CV that
// put 8 lines in the denominator when 3 were real bullets, so 3 perfectly
// quantified achievements scored 25% and a CV with no quantifier at all was
// indistinguishable from a good one. Restricting to achievement sections is
// what makes the impact and verb ratios mean anything.
function extractBullets(text) {
  const lines = normalize(text).split(/\n+/).map(l => l.trim()).filter(Boolean);
  const bullets = [];
  let inAchievementSection = false;

  for (const line of lines) {
    if (isHeading(line)) {
      if (ACHIEVEMENT_SECTIONS.some(re => re.test(line))) {
        inAchievementSection = true;
      } else if (NON_ACHIEVEMENT_SECTIONS.some(re => re.test(line))) {
        inAchievementSection = false;
      }
      // Otherwise the heading is a role title or similar: stay in the current
      // section rather than resetting it.
      continue;
    }
    if (!inAchievementSection) continue;

    const t = stripBulletMarker(line);
    // Role and date headers ("Engineer - Acme", "2019 - Present") sit inside the
    // experience section but are not bullets.
    if (!t) continue;
    if (/^(present|current|now)\b/i.test(t)) continue;
    if (/^\d{4}\s*[-–—]\s*(present|current|\d{4})/i.test(t)) continue;
    if (t.split(/\s+/).length > 60) continue; // prose paragraph
    bullets.push(t);
  }

  return bullets;
}

// Is a bullet quantified?
//
// The question this answers is "does this bullet state a measurable result?", so
// the rule is: a number counts unless it is a year or a version.
//
// Rejecting years and versions is the only filtering needed. An earlier version
// instead demanded a unit word from a fixed list, which was wrong in both
// directions: it missed "18,000 EUR" (currency written after the amount, the
// normal French format) and "trained 8 new engineers" (no unit word at all), so
// genuinely strong bullets scored as unquantified. A long noun list can never be
// complete, and the cost of a miss is higher than the cost of a false positive:
// telling someone their quantified bullet is weak is what teaches them to
// ignore the score.
//
// Magnitude and currency are checked first, because they disambiguate the rest.
// "99.95%" and "250k" are results; "3.11" and "React 18" are version strings.
const CURRENCY = /[$€£]|\b(?:eur|euros?|usd|dollars?|gbp|xaf|cfa|francs?)\b/i;
const PERCENT = /%/;
const MULTIPLIER = /\d\s*(?:k|m|bn|million|billion|x)\b/i;
const NUMBER_TOKEN = /\d+(?:[.,]\d+)*/g;
const YEAR = /^(?:19|20)\d{2}$/;
const VERSION_PREFIX = /[vV]$/;
// A date such as 03/04/2024 or 2021-2023.
const DATE = /^\d{1,4}[/-]\d{1,4}[/-]?\d{0,4}$/;
// 1,000 / 12,500,000 -- a thousands separator, so still a plain number.
const THOUSANDS = /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;

function hasNumber(text) {
  const s = typeof text === 'string' ? text : '';
  if (!s || !/\d/.test(s)) return false;

  const re = new RegExp(NUMBER_TOKEN.source, 'g');
  let m;
  while ((m = re.exec(s)) !== null) {
    const token = m[0];
    const before = s.slice(0, m.index);
    const after = s.slice(m.index + token.length);
    // Characters either side of the figure, used for magnitude/currency checks.
    const window = before.slice(-12) + '\u0000' + after.slice(0, 12);

    // 250k, 1.2M, 3x -- an explicit magnitude is a result in its own right.
    if (/^\s*(?:k|m|bn|million|billion|x)\b/i.test(after)) return true;
    if (PERCENT.test(window)) return true;
    if (CURRENCY.test(window)) return true;

    if (YEAR.test(token)) continue;                 // 2021
    if (DATE.test(token)) continue;                  // 2021-2023
    if (/^\s*[/-]/.test(after) || /[/-]\s*$/.test(before)) continue; // 03/04/2024, a range
    // "9,000" and "12,500,000" are counts, not versions: the comma is a thousands
    // separator. Only a dotted figure with no magnitude, currency or percentage
    // nearby is treated as a version, which is what "Python 3 to 3.11" is.
    if (/[.,]/.test(token) && !THOUSANDS.test(token)) continue;

    // A short figure right after a capitalised word is a version string:
    // "React 18", "Python 3", "Word 16". A count is never introduced this way --
    // but a sentence's first word is always capitalised, so "Built 8 internal
    // services" must not be read as a product name followed by a version.
    if (VERSION_PREFIX.test(before)) continue;
    const prevWord = before.match(/(\p{L}+)\s*$/u);
    if (prevWord && /^\p{Lu}/u.test(prevWord[1]) && token.length <= 2) {
      const preceding = before.slice(0, before.lastIndexOf(prevWord[1]));
      const sentenceInitial = preceding === '' || /[.!?:;]\s*$/.test(preceding);
      if (!sentenceInitial) continue;
    }

    return true;
  }

  return false;
}

// Section-heading detection for raw text. Anchored to a line start and
// bilingual, so a francophone CV ("EXPERIENCE PROFESSIONNELLE", "FORMATION") is
// not reported as having no experience section at all.
const SUMMARY_RE = /(^|\n)\s*(professional\s+summary|summary|profile|r[ée]sum[ée]|profil|objectif)/i;
const EXPERIENCE_RE = /(^|\n)\s*(work\s+|professional\s+)?(experience|employment|professional\s+experience|exp[ée]rience|parcours)/i;
const EDUCATION_RE = /(^|\n)\s*(education|academic|formation|[ée]tudes|dipl[oô]mes)/i;
const SKILLS_RE = /(^|\n)\s*(technical\s+)?(skills|competences|comp[ée]tences|expertise)/i;

function firstWord(line) {
  const cleaned = line
    .replace(/^\s*[-*\u2022\u2013\u2014>#\d.)\s]+/, '')
    .replace(/^[^A-Za-z\u00C0-\u024F]+/, '') // leading quotes, parens, punctuation
    .trim();
  const m = cleaned.match(/^[\p{L}']+/u);
  return m ? m[0].toLowerCase() : '';
}

function contactFromText(text) {
  const t = normalize(text);
  return {
    email: EMAIL_RE.test(t) ? 1 : 0,
    phone: PHONE_RE.test(t) ? 1 : 0,
    linkedin: LINKEDIN_RE.test(t) ? 1 : 0
  };
}

function pickContact(cvText, tailoredCV) {
  const fromCv = contactFromText(cvText);
  return {
    email: tailoredCV?.email ? 1 : fromCv.email,
    phone: tailoredCV?.phone ? 1 : fromCv.phone,
    linkedin: (tailoredCV?.linkedin ? 1 : 0) || fromCv.linkedin,
    // Location has no reliable regex; only a structured CV can supply it.
    location: tailoredCV?.location ? 1 : 0
  };
}

/**
 * @param {string} cvText            Raw CV text (required unless tailoredCV present)
 * @param {object} [tailoredCV]     Structured CV, when one exists. Preferred over
 *                                   regex extraction for every field it carries.
 * @returns {{score:number, categories:Array<{key:string,score:number,max:number,findings:Array}>}}
 */
function computeResumeScore(cvText, tailoredCV) {
  const text = normalize(cvText || '') ||
    (tailoredCV ? renderStructured(tailoredCV) : '');

  // When a structured CV is available its bullets are known exactly, so they are
  // taken directly. Rendering it back to text and re-parsing is both lossy (the
  // rendered form carries no section headings, so a section-aware bullet
  // detector finds nothing) and pointless. This bug scored a fully complete
  // structured CV at 0/25 on impact and 0/15 on verbs.
  const bullets = bulletsFromStructured(tailoredCV) ?? extractBullets(text);

  const categories = CATEGORIES.map(c => ({
    key: c.key,
    score: 0,
    max: c.max,
    findings: [],
    ...scoreCategory(c.key, c.max, text, tailoredCV, bullets)
  }));

  const score = Math.max(0, Math.min(100, categories.reduce((s, c) => s + c.score, 0)));
  return { score, categories };
}

function bulletsFromStructured(cv) {
  if (!cv || !Array.isArray(cv.experience)) return null;
  const bullets = [];
  cv.experience.forEach(exp => {
    if (Array.isArray(exp?.bullets)) {
      exp.bullets.forEach(b => {
        const t = typeof b === 'string' ? b.trim() : '';
        if (t) bullets.push(t);
      });
    }
  });
  return bullets.length ? bullets : null;
}

function renderStructured(cv) {
  const lines = [];
  if (cv.summary) lines.push(cv.summary);
  (cv.experience || []).forEach(e => {
    lines.push([e.title, e.company].filter(Boolean).join(' - '));
    (e.bullets || []).forEach(b => lines.push(b));
  });
  (cv.education || []).forEach(e => lines.push([e.degree, e.institution].filter(Boolean).join(' - ')));
  (cv.skills || []).forEach(s => lines.push(s));
  return lines.join('\n');
}

function scoreCategory(key, max, text, tailoredCV, bullets) {
  switch (key) {
    case 'contact': return scoreContact(max, text, tailoredCV);
    case 'structure': return scoreStructure(max, text, tailoredCV, bullets);
    case 'impact': return scoreImpact(max, bullets);
    case 'verbs': return scoreVerbs(max, bullets);
    case 'brevity': return scoreBrevity(max, text, tailoredCV);
    case 'language': return scoreLanguage(max, text);
    default: return { score: 0, findings: [] };
  }
}

function scoreContact(max, text, tailoredCV) {
  const c = pickContact(text, tailoredCV);
  const findings = [];
  const parts = { email: 4, phone: 3, location: 1, linkedin: 2 };

  Object.entries(parts).forEach(([field, points]) => {
    if (!c[field]) findings.push({ code: `contact.missing_${field}`, params: {}, points });
  });

  const score = Object.entries(parts).reduce((s, [f, p]) => s + (c[f] ? p : 0), 0);
  return { score: Math.min(score, max), findings };
}

function scoreStructure(max, text, tailoredCV, bullets) {
  const findings = [];
  let score = 0;

  const hasSummary = Boolean(tailoredCV ? tailoredCV.summary : SUMMARY_RE.test(text));
  score += hasSummary ? 7 : 0;
  if (!hasSummary) findings.push({ code: 'structure.missing_summary', params: {}, points: 7 });

  const exp = tailoredCV?.experience;
  const hasExp = tailoredCV ? (exp?.length > 0) : EXPERIENCE_RE.test(text);
  score += hasExp ? 7 : 0;
  if (!hasExp) findings.push({ code: 'structure.missing_experience', params: {}, points: 7 });

  // A single-bullet role reads as a job description, not an achievement list.
  const firstRoleBullets = exp?.[0]?.bullets?.length ?? null;
  const enoughDetail = firstRoleBullets === null
    ? bullets.length >= 2
    : firstRoleBullets >= 2;
  score += enoughDetail ? 5 : 0;
  if (!enoughDetail) findings.push({ code: 'structure.thin_bullets', params: {}, points: 5 });

  const hasEdu = tailoredCV
    ? (tailoredCV.education?.length > 0)
    : EDUCATION_RE.test(text);
  score += hasEdu ? 4 : 0;
  if (!hasEdu) findings.push({ code: 'structure.missing_education', params: {}, points: 4 });

  const skillCount = tailoredCV ? (tailoredCV.skills?.length || 0) : 0;
  const hasSkills = tailoredCV ? skillCount >= 3 : SKILLS_RE.test(text);
  score += hasSkills ? 2 : 0;
  if (!hasSkills) findings.push({ code: 'structure.missing_skills', params: {}, points: 2 });

  return { score: Math.min(score, max), findings };
}

function scoreImpact(max, bullets) {
  const findings = [];

  if (bullets.length === 0) {
    return {
      score: 0,
      findings: [{ code: 'impact.no_bullets', params: {}, points: max }]
    };
  }

  const quantified = bullets.filter(hasNumber).length;
  const ratio = quantified / bullets.length;
  const score = Math.round(ratio * max);

  if (quantified === 0) {
    findings.push({ code: 'impact.none_quantified', params: { total: bullets.length }, points: max });
  } else if (ratio < 0.34) {
    findings.push({
      code: 'impact.few_quantified',
      params: { count: quantified, total: bullets.length },
      points: Math.round(max * 0.5)
    });
  }

  return { score: Math.min(score, max), findings };
}

function scoreVerbs(max, bullets) {
  const findings = [];

  if (bullets.length === 0) {
    return { score: 0, findings: [{ code: 'verbs.no_bullets', params: {}, points: max }] };
  }

  const starts = bullets.map(firstWord);
  const strong = starts.filter(w => STRONG_VERBS.has(w)).length;
  const weak = starts.filter(w => WEAK_VERBS.has(w)).length;
  const score = Math.round((strong / bullets.length) * max);

  if (weak > 0) {
    findings.push({
      code: 'verbs.weak_openers',
      params: { count: weak, total: bullets.length },
      points: Math.round((weak / bullets.length) * max)
    });
  }
  if (strong / bullets.length < 0.5) {
    findings.push({
      code: 'verbs.few_strong',
      params: { count: strong, total: bullets.length },
      points: Math.round((1 - strong / bullets.length) * max * 0.5)
    });
  }

  return { score: Math.min(score, max), findings };
}

function scoreBrevity(max, text, tailoredCV) {
  const findings = [];

  // Raw text is the more faithful length measurement, so it wins whenever it is
// present. renderStructured() is only a reconstruction: it carries no contact
  // block and no section headings, so preferring it made the same CV score 98
  // through one upload path and 99 through another.
  const source = text || (tailoredCV ? renderStructured(tailoredCV) : '');
  const words = wordCount(source);
  // Calibrated against real CV length rather than a round number. The floor is
  // where a CV stops carrying enough to be assessed at all: contact, a summary,
  // one role with three bullets, education and skills lands around 200 words, so
  // under 250 is genuinely thin. The ceiling is one page -- a single-spaced page
  // at 11pt holds roughly 500 words, so beyond 800 the document is spilling and
  // an ATS reader is being asked to scan a second page.
  const target = { min: 250, ideal: 550, hardMax: 800 };

  // Nothing to judge before there is anything to read.
  if (words === 0) {
    return { score: 0, findings: [{ code: 'brevity.empty', params: {}, points: max }] };
  }

  let ratio;
  if (words < target.min) {
    ratio = words / target.min;
    findings.push({ code: 'brevity.too_short', params: { words, target: target.min }, points: max });
  } else if (words <= target.hardMax) {
    ratio = 1;
  } else if (words <= target.hardMax * 1.25) {
    ratio = 1 - ((words - target.hardMax) / (target.hardMax * 1.25 - target.hardMax)) * 0.5;
    findings.push({
      code: 'brevity.over_target',
      params: { words, target: target.hardMax },
      points: Math.round(max * 0.5)
    });
  } else {
    ratio = 0.5 * (1 - Math.min(1, (words - target.hardMax * 1.25) / (target.hardMax * 2)));
    findings.push({
      code: 'brevity.too_long',
      params: { words, target: target.hardMax },
      points: Math.round(max * 0.75)
    });
  }

  return { score: Math.round(Math.max(0, Math.min(1, ratio)) * max), findings };
}

function scoreLanguage(max, text) {
  const sentences = splitSentences(text);
  const findings = [];

  if (sentences.length === 0) {
    return { score: 0, findings: [{ code: 'language.no_sentences', params: {}, points: max }] };
  }

  const lengths = sentences.map(s => s.split(/\s+/).filter(Boolean).length);
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const overlong = lengths.filter(l => l > 35).length;
  const overlongShare = overlong / sentences.length;

  // Two independent penalties, each worth half the category.
  let ratio = 1;
  if (avg > 30) {
    ratio -= 0.5;
    findings.push({
      code: 'language.long_sentences',
      params: { avg: Math.round(avg), count: overlong, total: sentences.length },
      points: Math.round(max * 0.5)
    });
  }
  if (overlongShare > 0.2) {
    ratio -= 0.5;
    if (!findings.some(f => f.code === 'language.long_sentences')) {
      findings.push({
        code: 'language.mostly_long',
        params: { count: overlong, total: sentences.length },
        points: Math.round(max * 0.5)
      });
    }
  }

  return { score: Math.round(Math.max(0, Math.min(1, ratio)) * max), findings };
}

exports.computeResumeScore = computeResumeScore;
exports.CATEGORIES = CATEGORIES;
exports.STRONG_VERBS = STRONG_VERBS;
// Exported for tests only.
exports._internals = {
  extractBullets,
  hasNumber,
  firstWord,
  wordCount,
  splitSentences,
  PATTERNS: { EMAIL_RE, PHONE_RE, LINKEDIN_RE }
};