const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_RE = /(\+?\d{1,3}[ .-]?)?(\(?\d{2,4}\)?[ .-]?)?\d{3,4}[ .-]?\d{3,4}(?:[ .-]?\d{3,4})?/;
const YEAR_RE = /\b(19|20)\d{2}\b/;
const MONTH_NAMES = 'january|february|march|april|june|july|september|october|november|december|janvier|février|fevrier|septembre|octobre|novembre|décembre|decembre|jan|feb|mar|apr|may|jun|jul|aug|sept|sep|oct|nov|dec|mars|avril|mai|juin|juillet|août|aout';
const MONTH_PAT = `\\b(?:${MONTH_NAMES})`;
const YEAR_OR_MONTH_RE = new RegExp(`(?:19|20)\\d{2}|${MONTH_PAT}\\s*(?:19|20)\\d{2}`, 'i');
const DATE_RANGE_RE = new RegExp(`(?:19|20)\\d{2}\\s*(?:-|–|to|à|–)?\\s*(?:(?:19|20)\\d{2}|present|pr.sent|now|today|aujourd|à ce jour)?|${MONTH_PAT}\\s*(?:19|20)\\d{2}(?:\\s*(?:-|–|to|à)\\s*(?:(?:19|20)\\d{2}|${MONTH_PAT}\\s*(?:19|20)\\d{2}|present|pr.sent|now|today|à ce jour))?`, 'i');
const ENTRY_DATE_RE = new RegExp(`\\s*\\(?\\s*(?:(?:19|20)\\d{2}|${MONTH_PAT}\\s*(?:19|20)\\d{2})\\s*(?:-|–|to|à|–)?\\s*(?:(?:19|20)\\d{2}|${MONTH_PAT}\\s*(?:19|20)\\d{2}|present|pr.sent|now|today)?\\s*\\)?\\s*$`, 'i');

const SECTION_HEADERS = [
  { id: 'summary', re: /^(professional\s+summary|summary|profile|about\s+me|r.sum.|profil|objectif|objective|r.sum\s+professionnel|r.sum\s+de\s+carri.re)$/i },
  { id: 'experience', re: /^(professional\s+experience|work\s+experience|experience|employment|employment\s+history|career\s+history|exp.rience|exp.rience\s+professionnelle|exp.rience\s+de\s+travail|parcours\s+professionnel)$/i },
  { id: 'education', re: /^(education|academic\s+background|formation|formation\s+acad.mique|dipl.me|études|etudes)$/i },
  { id: 'skills', re: /^(skills|core\s+competencies|technical\s+skills|key\s+skills|comp.tences|comp.tences\s+cl.s|savoir-faire)$/i },
  { id: 'languages', re: /^(languages|languages\s+spoken|langues|langues\s+parl.es)$/i }
];

const ADDITIONAL_HEADERS = [
  /^(certifications|certificats|certification|licenses|licences)$/i,
  /^(projects|projets|personal\s+projects)$/i,
  /^(volunteer|volunteering|volunteer\s+work|b.n.volat|benevolat|volontariat)$/i,
  /^(references|r.f.rences)$/i,
  /^(interests|hobbies|centres\s+d.int.r.t|centres\s+d'intérêt|loisirs)$/i,
  /^(achievements|accomplishments|r.alisations|accomplissements|honors|distinctions|prix|awards)$/i,
  /^(trainings|s.minaires|seminars|formations\s+compl.mentaires)$/i
];

const isHeader = (line) => {
  const l = line.trim().replace(/:$/, '').trim();
  if (!l || l.length > 40) return null;
  const match = SECTION_HEADERS.find((s) => s.re.test(l));
  if (match) return match.id;
  return ADDITIONAL_HEADERS.some((re) => re.test(l)) ? 'additional' : null;
};

function extractName(lines) {
  for (const line of lines) {
    const l = line.trim();
    if (!l || l.length > 60 || EMAIL_RE.test(l)) continue;
    if (/\d/.test(l)) continue;
    if (l.toLowerCase().startsWith('summary') || l.toLowerCase().startsWith('profil') || l.toLowerCase().startsWith('résum')) continue;
    return l;
  }
  return '';
}

function splitSections(text) {
  const rawLines = String(text || '').split(/\r?\n/);
  const lines = rawLines.map((l) => l.trim());

  // Contact block: everything before the first detected section header
  let headerIdx = lines.findIndex((l) => isHeader(l));
  const contactLines = headerIdx === -1 ? lines : lines.slice(0, headerIdx);

  const sections = [];
  let current = null;
  for (let i = headerIdx === -1 ? 0 : headerIdx; i < lines.length; i++) {
    const id = isHeader(lines[i]);
    if (id) {
      current = { id, header: lines[i].replace(/:$/, '').trim(), lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(lines[i]);
    }
  }

  return { contactLines: contactLines.filter(Boolean), sections };
}

function parseContact(contactLines) {
  const joined = contactLines.join(' | ');
  const email = (joined.match(EMAIL_RE) || [])[0] || '';
  const withoutEmail = joined.replace(EMAIL_RE, '');

  // Prefer a full Cameroon-style number; fall back to any phone-like token
  const cam = withoutEmail.match(/(\+237[\s.-]?\d{2}[\s.-]?\d{3}[\s.-]?\d{3}|\b[679]\d[\s.-]\d{3}[\s.-]\d{3}\b)/);
  const anyPhone = withoutEmail.match(PHONE_RE);
  const phone = (cam && cam[0].trim()) || (anyPhone && anyPhone[0].trim()) || '';

  const contactText = withoutEmail.replace(PHONE_RE, ' ').trim();
  const location = contactText.replace(/[|;]/g, ' ').replace(/\s+/g, ' ').trim();

  const name = extractName(contactLines);
  return { name, email, phone, location };
}

function isBulletLine(line) {
  return /^[-•·*—–]\s*/.test(line) || line.startsWith('- ');
}

function stripDateTokens(line) {
  return line
    .replace(/[()]/g, ' ')
    .replace(new RegExp(`${MONTH_PAT}`, 'ig'), ' ')
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/\b(present|pr.sent|now|today|à ce jour|aujourd[^ ]*)\b/ig, ' ')
    .replace(/[-–—toà,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isDateOnlyLine(line) {
  if (!YEAR_OR_MONTH_RE.test(line)) return false;
  return stripDateTokens(line).length <= 2;
}

function parseSection(section) {
  const out = { id: section.id, entries: [], raw: section.lines.join('\n') };

  if (section.id === 'summary') {
    out.text = section.lines.filter(Boolean).join(' ');
    return out;
  }

  if (section.id === 'skills') {
    const joined = section.lines.filter(Boolean).join(', ');
    out.items = joined
      .split(/[,;\n•·*|]/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2);
    return out;
  }

  if (section.id === 'languages') {
    out.items = section.lines
      .filter(Boolean)
      .join(', ')
      .split(/[,;\n•·*|]/)
      .map((s) => s.trim())
      .filter(Boolean);
    return out;
  }

  if (section.id === 'experience' || section.id === 'education') {
    let entry = null;
    let lastTitleIdx = -1;
    for (const line of section.lines) {
      if (!line) { entry = null; continue; }

      if (isBulletLine(line)) {
        const text = line.replace(/^[-•·*—–]\s*/, '').trim();
        if (entry) entry.bullets.push(text);
        else if (lastTitleIdx >= 0) out.entries[lastTitleIdx].bullets.push(text);
        else { entry = { title: '', bullets: [text] }; out.entries.push(entry); lastTitleIdx = out.entries.length - 1; }
        continue;
      }

      if (isDateOnlyLine(line)) {
        if (entry && entry.title) entry.title = `${entry.title} (${line.replace(/[()]/g, '').trim()})`;
        continue;
      }

      const looksLikeTitle = line.length > 3 && !/^\d/.test(line) && !/^\W+$/.test(line);
      if (!looksLikeTitle) continue;

      const entryHasDate = !!entry && !!entry.title && YEAR_OR_MONTH_RE.test(entry.title);
      const startsNew = YEAR_OR_MONTH_RE.test(line) || /(\bat\b|\bà\b)/.test(line) || /^(institut|lyc|universit|coll|school|ecole|école|centre)/i.test(line);

      if (entry && entryHasDate && startsNew) {
        entry = { title: line, bullets: [] };
        out.entries.push(entry);
        lastTitleIdx = out.entries.length - 1;
      } else if (entry) {
        entry.title = entry.title ? `${entry.title} — ${line}` : line;
      } else {
        entry = { title: line, bullets: [] };
        out.entries.push(entry);
        lastTitleIdx = out.entries.length - 1;
      }
    }
    out.entries = out.entries.filter((e) => e.title && e.title.trim());
    return out;
  }

  out.items = section.lines.filter(Boolean);
  return out;
}

function toCVApi(parsed) {
  const { contactLines, sections } = parsed;

  const byId = {};
  sections.forEach((s) => { byId[s.id] = parseSection(s); });

  const summary = byId.summary;
  const experience = byId.experience;
  const education = byId.education;
  const skills = byId.skills;
  const languages = byId.languages;

  const contact = parseContact(contactLines);

  const additional = sections
    .filter((s) => !['summary', 'experience', 'education', 'skills', 'languages'].includes(s.id))
    .map((s) => ({
      title: s.id === 'additional' ? (s.header || 'Additional') : s.id,
      content: s.raw
    }));
  return {
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    location: contact.location,
    summary: summary ? summary.text : '',
    experience: experience
      ? experience.entries.map((e) => {
          const raw = e.title || '';
          const dateMatch = raw.match(ENTRY_DATE_RE);
          const dates = dateMatch ? dateMatch[0].replace(/[()]/g, '').trim() : '';
          const title = dateMatch ? raw.replace(dateMatch[0], '').trim() : raw;
          const m = title.match(/^(.+?)(\s+(at|à)\s+|\s*[-–—]\s*)(.+)$/i);
          return {
            title: (m ? m[1] : title).trim(),
            company: (m ? m[4] : '').trim(),
            dates,
            bullets: e.bullets
          };
        })
      : [],
    education: education
      ? education.entries.map((e) => {
          const raw = e.title || '';
          const dateMatch = raw.match(ENTRY_DATE_RE);
          const dates = dateMatch
            ? dateMatch[0].replace(/[()]/g, '').trim()
            : (e.bullets[0] || '').match(DATE_RANGE_RE)?.[0] || '';
          const title = dateMatch ? raw.replace(dateMatch[0], '').trim() : raw;
          const m = title.match(/^(.*?)(\s+[-–—]\s+|\s+at\s+|\s+à\s+)(.*)$/i);
          return {
            degree: (m ? m[1] : title).trim(),
            institution: (m ? m[3] : '').trim(),
            dates,
            details: e.bullets.join(' ') || ''
          };
        })
      : [],
    skills: skills ? skills.items : [],
    languages: languages ? languages.items : [],
    additionalSections: additional
  };
}

function parseCVText(text) {
  const parsed = splitSections(text);
  return toCVApi(parsed);
}

module.exports = { parseCVText, splitSections, parseContact, parseSection, isHeader };
