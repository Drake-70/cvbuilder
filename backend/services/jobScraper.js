const axios = require('axios');
const cheerio = require('cheerio');
const Job = require('../models/Job');
const logger = require('../utils/logger');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
const REQUEST_TIMEOUT = 20000;
const MAX_PER_SOURCE = 30;
const MAX_DETAIL_ENRICHMENT = parseInt(process.env.JOB_ENRICH_MAX || '12', 10);
const POLITE_DELAY_MS = 1500;

const CATEGORY_KEYWORDS = {
  'IT & Software': ['developer', 'developpeur', 'software', 'ingénieur logiciel', 'engineer', 'data', 'devops', 'full stack', 'frontend', 'backend', 'programmeur', 'programmer', 'it support', 'réseau', 'network', 'security', 'sécurité', 'web', 'mobile', 'product manager', 'ux', 'ui', 'designer'],
  'Accounting & Finance': ['accountant', 'comptable', 'finance', 'financier', 'audit', 'treasury', 'trésorier', 'bank', 'banque', 'bookkeeper', 'fiscal', 'tax'],
  'Engineering': ['engineer', 'ingénieur', 'civil', 'mechanical', 'mécanique', 'electrical', 'électrique', 'electrician', 'électricien', 'technician', 'technicien', 'hvac', 'plumbing', 'plombier', 'maintenance'],
  'Sales & Marketing': ['sales', 'vente', 'marketing', 'commercial', 'account manager', 'business development', 'développement commercial', 'brand', 'social media', 'content', 'seo', 'growth', 'b2b', 'b2c'],
  'Healthcare': ['nurse', 'infirmier', 'infirmière', 'doctor', 'médecin', 'pharmacist', 'pharmacien', 'lab', 'laboratory', 'laboratoire', 'medical', 'médical', 'radiologist', 'clinique'],
  'Education': ['teacher', 'enseignant', 'professeur', 'tutor', 'formateur', 'instructor', 'lecturer', 'school', 'école', 'pedagogue', 'education', 'éducation'],
  'Administration & HR': ['admin', 'administratif', 'receptionist', 'réceptionniste', 'secretary', 'secrétaire', 'hr', 'rh', 'human resources', 'ressources humaines', 'recruiter', 'recruteur', 'office', 'bureau', 'assistant'],
  'Logistics & Transport': ['logistics', 'logistique', 'driver', 'chauffeur', 'transport', 'supply chain', 'chaîne', 'warehouse', 'entrepôt', 'procurement', 'approvisionnement', 'delivery', 'livreur', 'fleet', 'flotte'],
  'Hospitality & Tourism': ['hotel', 'hôtel', 'restaurant', 'chef', 'cuisinier', 'waiter', 'serveur', 'hospitality', 'tourisme', 'tourism', 'reception', 'front desk', 'housekeeping', 'travel', 'voyage'],
  'Management': ['manager', 'directeur', 'director', 'lead', 'supervisor', 'superviseur', 'coordinator', 'coordinateur', 'head of', 'chef de', 'operations', 'opérations', 'general manager', 'responsable']
};

const SOURCES = [
  {
    key: 'goafrica',
    name: 'Go Africa',
    searchUrl: () => 'https://www.goafricaonline.com/cm/emploi',
    parse: ($, pageUrl) => parseGoAfrica($, pageUrl)
  },
  {
    key: 'louma',
    name: 'Louma Jobs',
    searchUrl: () => 'https://louma-jobs.com/cameroun/recrutements-emplois-stages/',
    parse: ($, pageUrl) => parseLouma($, pageUrl)
  }
];

function clean(text) {
  return String(text || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const BOGUS_COMPANY_PATTERNS = [
  /offre\s+d['’]?[\s-]*emploi/i,
  /jobinfo/i,
  /camerjobs/i,
  /louma\s*jobs/i
];

function cleanCompany(name) {
  const c = clean(name).replace(/\s*[-–—]\s*$/, '');
  if (!c) return '';
  if (c.replace(/[^a-zA-Zà-ÿÀ-Ý]/g, '').length < 2) return '';
  for (const pattern of BOGUS_COMPANY_PATTERNS) {
    if (pattern.test(c)) return '';
  }
  return c;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(base) {
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

function scalar(v) {
  return Array.isArray(v) ? v[0] : v;
}

function absoluteUrl(href, base) {
  if (!href) return '';
  try {
    return new URL(href, base).href;
  } catch {
    return '';
  }
}

function extractEmails(text) {
  const match = (text || '').match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0].toLowerCase() : '';
}

function detectRemote(title, description, location) {
  const blob = `${title} ${description} ${location}`.toLowerCase();
  return /\b(remote|télétravail|telework|work from home)\b/.test(blob);
}

function guessCategory(title, description) {
  const blob = `${title} ${description}`.toLowerCase();
  for (const [category, pattern] of Object.entries(CATEGORY_PATTERNS)) {
    if (pattern.test(blob)) return category;
  }
  return 'Other';
}

const CATEGORY_PATTERNS = Object.fromEntries(
  Object.entries(CATEGORY_KEYWORDS).map(([category, keywords]) => [
    category,
    new RegExp(
      keywords.map((k) => {
        const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return k.length <= 3 ? `\\b${esc}\\b` : esc;
      }).join('|'),
      'i'
    )
  ])
);

function parseDate(text) {
  const blob = (text || '').toLowerCase();
  const relDays = blob.match(/(\d+)\s*days?\s*ago/);
  if (relDays) return new Date(Date.now() - parseInt(relDays[1], 10) * 86400000);
  const relHours = blob.match(/(\d+)\s*hours?\s*ago/);
  if (relHours) return new Date(Date.now() - parseInt(relHours[1], 10) * 3600000);
  const frHours = blob.match(/il y a (\d+)\s*heures?\b/);
  if (frHours) return new Date(Date.now() - parseInt(frHours[1], 10) * 3600000);
  const frDays = blob.match(/il y a (\d+)\s*jours?\b/);
  if (frDays) return new Date(Date.now() - parseInt(frDays[1], 10) * 86400000);
  const months = { jan: 0, janv: 0, feb: 1, févr: 1, fevr: 1, mar: 2, mars: 2, apr: 3, avr: 3, may: 4, mai: 4, jun: 5, juin: 5, jul: 6, juil: 6, juill: 6, aug: 7, août: 7, aout: 7, sep: 8, sept: 8, oct: 9, nov: 10, déc: 11, dec: 11 };
  const dm = blob.match(/(\d{1,2})\s+(janv?|févr?|fevr?|mars|avr|mai|juin|juil?l?|aoû?t|aout|sept?|oct|nov|déc|dec)[a-z]*\.?\s*,?\s*(\d{4})?/);
  if (dm) {
    const year = dm[3] ? parseInt(dm[3], 10) : new Date().getFullYear();
    return new Date(year, months[dm[2]], parseInt(dm[1], 10));
  }
  return null;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    let out = '';
    let inStr = false;
    let esc = false;
    for (const ch of text) {
      if (inStr) {
        if (esc) { esc = false; out += ch; continue; }
        if (ch === '\\') { esc = true; out += ch; continue; }
        if (ch === '"') { inStr = false; out += ch; continue; }
        if (ch === '\n') { out += '\\n'; continue; }
        if (ch === '\r') { out += '\\r'; continue; }
        if (ch === '\t') { out += '\\t'; continue; }
        out += ch;
        continue;
      }
      if (ch === '"') { inStr = true; }
      out += ch;
    }
    try {
      return JSON.parse(out);
    } catch {
      return null;
    }
  }
}

function extractJsonLdJobs($, baseUrl) {
  const jobs = [];
  $('script[type="application/ld+json"]').each((_i, el) => {
    const parsed = safeJsonParse($(el).contents().text());
    if (!parsed) return;
    const items = Array.isArray(parsed) ? parsed : (parsed['@graph'] ? parsed['@graph'] : [parsed]);
    for (const item of items) {
      if (!item || item['@type'] !== 'JobPosting' && !(Array.isArray(item['@type']) && item['@type'].includes('JobPosting'))) continue;
      if (!item.title || !item.title.trim()) continue;
      const addr = item.jobLocation?.address || item.jobLocation || {};
      const loc = typeof addr === 'object' ? scalar(addr.addressLocality) || scalar(addr.name) || '' : '';
      const company = typeof item.hiringOrganization === 'object' && item.hiringOrganization
        ? scalar(item.hiringOrganization.name) || ''
        : '';
      jobs.push({
        title: clean(scalar(item.title)),
        company: clean(company),
        location: clean(loc),
        description: clean(scalar(item.description)),
        salary: clean(scalar(item.baseSalary?.value?.value || item.salary)),
        sourceUrl: absoluteUrl(scalar(item.url), baseUrl),
        applyUrl: absoluteUrl(scalar(item.url || item.directApply), baseUrl),
        postedAt: item.datePosted ? new Date(item.datePosted) : null,
        jobType: clean(scalar(item.employmentType))
      });
    }
  });
  return jobs;
}

function parseGoAfrica($, baseUrl) {
  const jobs = [];
  $('a[href*="/cm/emploi/job-"]').each((_i, el) => {
    const link = $(el);
    const href = link.attr('href');
    const title = clean(link.text());
    if (!href || !title) return;

    const container = link.parents().filter((_p, p) => {
      const $p = $(p);
      return $p.find('a[href*="/cm/emploi/job-"]').length === 1
        && ($p.find('div[class*="text-16"]').length >= 1 || $p.find('img[alt="Cameroun"]').length >= 1);
    }).first();

    const scope = container.length ? container : link.parent().parent();
    const location = clean(scope.find('img[alt="Cameroun"]').parent().find('div').last().text());
    const dateText = clean(scope.find('[grid-area="date"]').first().text().replace(/posté le/i, ''));

    jobs.push({
      title,
      company: clean(scope.find('div[class*="text-16"]').first().text()),
      location,
      salary: '',
      description: clean(scope.find('[grid-area="jobtitle"]').first().text()),
      sourceUrl: absoluteUrl(href, baseUrl),
      applyUrl: absoluteUrl(href, baseUrl),
      postedAt: parseDate(dateText),
      jobType: clean(scope.find('[grid-area="jobtitle"]').first().text())
    });
  });
  if (jobs.length) return jobs;
  return extractJsonLdJobs($, baseUrl);
}

function collectLouma($, baseUrl) {
  const jobs = [];
  $('.louma-job-card').each((_i, el) => {
    const card = $(el);
    const href = card.find('.card_default__title a, .louma-job-card__overlay-link').first().attr('href');
    const title = clean(card.find('.card_default__title').first().text());
    if (!href || !title) return;
    let jobType = '';
    card.find('.card_default__type_emploi').each((_t, elt) => {
      const t = clean($(elt).text());
      if (/^type\s*:/i.test(t)) {
        jobType = t.replace(/^type\s*:\s*/i, '');
      }
    });
    jobs.push({
      title,
      company: '',
      location: clean(card.find('.card_default__tags .no-decoration').first().text()),
      salary: '',
      description: '',
      sourceUrl: absoluteUrl(href, baseUrl),
      applyUrl: absoluteUrl(href, baseUrl),
      postedAt: null,
      jobType
    });
  });
  return jobs;
}

async function parseLouma($, baseUrl) {
  const jobs = collectLouma($, baseUrl);
  for (let page = 2; jobs.length < MAX_PER_SOURCE && page <= 3; page++) {
    await sleep(jitter(POLITE_DELAY_MS));
    try {
      const html = await fetchPage(`${baseUrl}page/${page}/`);
      const more = collectLouma(cheerio.load(html), baseUrl);
      if (!more.length) break;
      jobs.push(...more);
    } catch {
      break;
    }
  }
  if (jobs.length) return jobs;
  return extractJsonLdJobs($, baseUrl);
}

function normalizeJob(raw, sourceKey, sourceName) {
  if (!raw.title || !raw.sourceUrl) return null;
  let sourceUrl;
  try {
    sourceUrl = new URL(raw.sourceUrl).href;
  } catch {
    return null;
  }
  const title = clean(raw.title).slice(0, 200);
  const description = clean(raw.description).slice(0, 4000);
  const company = cleanCompany(raw.company).slice(0, 120);
  const location = clean(raw.location).slice(0, 160);
  return {
    title,
    company,
    location,
    description,
    salary: clean(raw.salary).slice(0, 120),
    jobType: clean(raw.jobType).slice(0, 80),
    source: sourceKey,
    sourceUrl,
    applyUrl: clean(raw.applyUrl || raw.sourceUrl).slice(0, 500),
    contactEmail: extractEmails(`${raw.description} ${raw.title}`),
    postedAt: raw.postedAt || null,
    isRemote: detectRemote(title, description, location),
    category: guessCategory(title, description),
    scrapedAt: new Date()
  };
}

async function fetchPage(url) {
  const lastErr = { error: null };
  for (let attempt = 0; attempt <= 2; attempt++) {
    if (attempt > 0) await sleep(jitter(3000) * Math.pow(2, attempt - 1));
    try {
      const res = await axios.get(url, {
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8'
        },
        timeout: REQUEST_TIMEOUT,
        responseType: 'text',
        maxRedirects: 5
      });
      return res.data;
    } catch (err) {
      lastErr.error = err;
      if (attempt < 2) {
        const retryAfter = err.response && err.response.status === 429
          ? parseInt(err.response.headers['retry-after'] || '', 10)
          : NaN;
        const wait = Number.isFinite(retryAfter) ? retryAfter * 1000 : jitter(2500) * Math.pow(2, attempt);
        await sleep(Math.max(wait, 1500));
      }
    }
  }
  throw lastErr.error;
}

async function enrichJob(job) {
  if (!job || !job.sourceUrl) return job;
  try {
    const html = await fetchPage(job.sourceUrl);
    const $ = cheerio.load(html);

    const jsonLd = extractJsonLdJobs($, job.sourceUrl)[0];
    if (jsonLd) {
      if (!job.company && jsonLd.company) job.company = cleanCompany(jsonLd.company).slice(0, 120);
      if (!job.location && jsonLd.location) job.location = jsonLd.location.slice(0, 160);
      if (!job.salary && jsonLd.salary) job.salary = jsonLd.salary.slice(0, 120);
      if (!job.jobType && jsonLd.jobType) job.jobType = jsonLd.jobType.slice(0, 80);
      if (job.postedAt === null && jsonLd.postedAt) job.postedAt = jsonLd.postedAt;
      if (!job.description && jsonLd.description) job.description = jsonLd.description.slice(0, 4000);
    }

    if (!job.description) {
      let description = clean($('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '');
      if (!description) {
        const container = $('article, [class*="description"], .job-description, [class*="job-detail"], [class*="offre"]').first();
        description = clean(container.text());
      }
      if (!description) {
        $('script, style, noscript, header, footer, nav, form').remove();
        description = clean($('body').text()).slice(0, 2500);
      }
      if (description) job.description = description.slice(0, 4000);
    }

    const salary = clean($('[class*="salary"], [class*="salaire"], [class*="wage"]').first().text());
    if (salary && !job.salary) job.salary = salary.slice(0, 120);

    const email = extractEmails(`${$.html()} ${job.description}`);
    if (email) job.contactEmail = email;

    if (job.postedAt === null) {
      const dateText = clean($('[class*="date"], time').first().text().replace(/posté le/i, ''));
      job.postedAt = parseDate(dateText);
    }

    job.category = guessCategory(job.title, job.description || '');
    job.isRemote = detectRemote(job.title, job.description || '', job.location || '');
  } catch {
    // detail enrichment is best-effort
  }
  return job;
}

async function scrapeSource(source) {
  const url = source.searchUrl();
  const html = await fetchPage(url);
  const $ = cheerio.load(html);
  const rawJobs = await source.parse($, url);
  const jobs = rawJobs
    .map((raw) => normalizeJob(raw, source.key, source.name))
    .filter(Boolean)
    .slice(0, MAX_PER_SOURCE);

  if (process.env.JOB_ENRICH_DETAILS !== 'false') {
    const needs = jobs.filter((job) => !job.company || !job.description || job.postedAt === null);
    const targets = [...needs, ...jobs.filter((job) => !needs.includes(job))].slice(0, MAX_DETAIL_ENRICHMENT);
    for (const job of targets) {
      await enrichJob(job);
      await sleep(jitter(600));
    }
  }
  return jobs;
}

async function upsertJobs(jobs) {
  if (!jobs.length) return { added: 0, updated: 0 };
  const ops = jobs.map((job) => ({
    updateOne: {
      filter: { sourceUrl: job.sourceUrl },
      update: { $set: { ...job } },
      upsert: true
    }
  }));
  const result = await Job.bulkWrite(ops, { ordered: false });
  return {
    added: result.upsertedCount || 0,
    updated: result.modifiedCount || 0,
    total: jobs.length
  };
}

async function scrapeAll() {
  const results = [];
  for (const source of SOURCES) {
    const started = Date.now();
    try {
      const jobs = await scrapeSource(source);
      const outcome = await upsertJobs(jobs);
      results.push({ source: source.key, status: 'ok', ...outcome, ms: Date.now() - started });
      logger.info(`[jobs] scraped ${source.name}: ${jobs.length} found (${outcome.added} new)`);
    } catch (err) {
      results.push({ source: source.key, status: 'error', error: err.message, ms: Date.now() - started });
      logger.warn(`[jobs] ${source.name} scrape failed: ${err.message}`);
    }
    await sleep(jitter(POLITE_DELAY_MS));
  }
  return results;
}

module.exports = { scrapeAll, scrapeSource, SOURCES, normalizeJob };
