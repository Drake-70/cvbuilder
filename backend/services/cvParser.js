const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_RE = /(\+?\d{1,3}[ .-]?)?(\(?\d{2,4}\)?[ .-]?)?\d{3,4}[ .-]?\d{3,4}(?:[ .-]?\d{3,4})?/;
const YEAR_RE = /\b(19|20)\d{2}\b/;
const DATE_RANGE_RE = /(19|20)\d{2}\s*(-|–|to|à|–)?\s*((19|20)\d{2}|present|présent|now|today|aujourd|à ce jour)?/i;
const ENTRY_DATE_RE = /\s*\(?\s*(?:19|20)\d{2}\s*(?:[-–—toà]\s*)?(?:(?:19|20)\d{2}|present|présent|now|today)?\s*\)?\s*$/i;

const SECTION_HEADERS = [
  { id: 'summary', re: /^(professional\s+summary|summary|profile|about\s+me|r.sum.|profil|objectif|objective|r.sum\s+professionnel|r.sum\s+de\s+carri.re)$/i },
  { id: 'experience', re: /^(professional\s+experience|work\s+experience|experience|employment|employment\s+history|career\s+history|exp.rience|exp.rience\s+professionnelle|exp.rience\s+de\s+travail|parcours\s+professionnel)$/i },
  { id: 'education', re: /^(education|academic\s+background|formation|formation\s+acad.mique|dipl.me|études|etudes)$/i },
  { id: 'skills', re: /^(skills|core\s+competencies|technical\s+skills|key\s+skills|comp.tences|comp.tences\s+cl.s|savoir-faire)$/i },
  { id: 'languages', re: /^(languages|languages\s+spoken|langues|langues\s+parl.es)$/i }
];

const isHeader = (line) => {
  const l = line.trim();
  if (l.length > 40) return null;
  const match = SECTION_HEADERS.find((s) => s.re.test(l));
  return match ? match.id : null;
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
      current = { id, lines: [] };
      sections.push(current);
    } else if (current && lines[i]) {
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

function parseSection(section) {
  const out = { id: section.id, entries: [], raw: section.lines.join('\n') };

  if (section.id === 'summary') {
    out.text = section.lines.join(' ');
    return out;
  }

  if (section.id === 'skills') {
    const joined = section.lines.join(', ');
    out.items = joined
      .split(/[,;\n•·*|-]/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2);
    return out;
  }

  if (section.id === 'languages') {
    out.items = section.lines
      .join(', ')
      .split(/[,;\n•·*|]/)
      .map((s) => s.trim())
      .filter(Boolean);
    return out;
  }

  if (section.id === 'experience' || section.id === 'education') {
    let entry = null;
    for (const line of section.lines) {
      const isBullet = /^[-•·*—–]\s*/.test(line) || line.startsWith('- ');
      if (isBullet) {
        if (entry) entry.bullets.push(line.replace(/^[-•·*—–]\s*/, '').trim());
        else if (entry === null) { entry = { bullets: [line.replace(/^[-•·*—–]\s*/, '').trim()] }; out.entries.push(entry); }
        continue;
      }

      const isEntryStart = YEAR_RE.test(line) || /^(20|19)\d{2}/.test(line) || /^\d{2}\/\d{4}/.test(line) || /(\bat\b|\bà\b|—|-|–)/.test(line) || /^(institut|lyc|universit|coll|school|ecole|école|centre)/i.test(line);
      const looksLikeTitle = line.length > 3 && !/^\d/.test(line) && !/^\W+$/.test(line);

      if (entry && isEntryStart && looksLikeTitle) {
        entry = { title: line, bullets: [] };
        out.entries.push(entry);
      } else if (entry) {
        entry.title = entry.title ? `${entry.title} — ${line}` : line;
        if (!entry.title) entry = { title: line, bullets: [] };
      } else if (looksLikeTitle) {
        entry = { title: line, bullets: [] };
        out.entries.push(entry);
      }
    }
    out.entries = out.entries.filter((e) => e.title && e.title.trim());
    return out;
  }

  out.items = section.lines;
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
    .map((s) => ({ title: s.id, content: s.raw }));
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
      ? education.entries.map((e) => ({
          degree: e.title || '',
          institution: '',
          dates: (e.bullets[0] || '').match(DATE_RANGE_RE)?.[0] || '',
          details: e.bullets.join(' ') || ''
        }))
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
