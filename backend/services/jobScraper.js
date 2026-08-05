const axios = require('axios');
const cheerio = require('cheerio');
const Job = require('../models/Job');
const logger = require('../utils/logger');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
const REQUEST_TIMEOUT = 20000;
const MAX_PER_SOURCE = 30;
const MAX_DETAIL_ENRICHMENT = 8;
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
    key: 'myjobmag',
    name: 'MyJobMag',
    searchUrl: () => 'https://www.myjobmag.com/jobs-cameroon',
    parse: ($, pageUrl) => parseMyJobMag($, pageUrl)
  },
  {
    key: 'emploi',
    name: 'Emploi.cm',
    searchUrl: () => 'https://www.emploi.cm/',
    parse: ($, pageUrl) => parseEmploi($, pageUrl)
  }
];

function clean(text) {
  return (text || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((k) => blob.includes(k))) return category;
  }
  return 'Other';
}

function parseDate(text) {
  const blob = (text || '').toLowerCase();
  const relDays = blob.match(/(\d+)\s*days?\s*ago/);
  if (relDays) return new Date(Date.now() - parseInt(relDays[1], 10) * 86400000);
  const relHours = blob.match(/(\d+)\s*hours?\s*ago/);
  if (relHours) return new Date(Date.now() - parseInt(relHours[1], 10) * 3600000);
  const months = { jan: 0, janv: 0, feb: 1, févr: 1, fevr: 1, mar: 2, mars: 2, apr: 3, avr: 3, may: 4, mai: 4, jun: 5, juin: 5, jul: 6, juil: 6, juill: 6, aug: 7, août: 7, aout: 7, sep: 8, sept: 8, oct: 9, nov: 10, déc: 11, dec: 11 };
  const dm = blob.match(/(\d{1,2})\s+(janv?|févr?|fevr?|mars|avr|mai|juin|juil?l?|aoû?t|aout|sept?|oct|nov|déc|dec)[a-z]*\.?\s*,?\s*(\d{4})?/);
  if (dm) {
    const year = dm[3] ? parseInt(dm[3], 10) : new Date().getFullYear();
    return new Date(year, months[dm[2]], parseInt(dm[1], 10));
  }
  return null;
}

function extractJsonLdJobs($, baseUrl) {
  const jobs = [];
  $('script[type="application/ld+json"]').each((_i, el) => {
    let parsed;
    try {
      parsed = JSON.parse($(el).contents().text());
    } catch {
      return;
    }
    const items = Array.isArray(parsed) ? parsed : (parsed['@graph'] ? parsed['@graph'] : [parsed]);
    for (const item of items) {
      if (!item || item['@type'] !== 'JobPosting' && !(Array.isArray(item['@type']) && item['@type'].includes('JobPosting'))) continue;
      if (!item.title || !item.title.trim()) continue;
      const loc = typeof item.jobLocation === 'object' && item.jobLocation
        ? item.jobLocation.address?.addressLocality || item.jobLocation.name || ''
        : '';
      const company = typeof item.hiringOrganization === 'object' && item.hiringOrganization
        ? item.hiringOrganization.name || ''
        : '';
      jobs.push({
        title: clean(item.title),
        company: clean(company),
        location: clean(loc),
        description: clean(item.description),
        salary: clean(item.baseSalary?.value?.value || item.salary || ''),
        sourceUrl: absoluteUrl(item.url, baseUrl),
        applyUrl: absoluteUrl(item.url || item.directApply, baseUrl),
        postedAt: item.datePosted ? new Date(item.datePosted) : null,
        jobType: clean(item.employmentType || '')
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

function parseMyJobMag($, baseUrl) {
  const jobs = [];
  $('.job-list li, ul.job-list li').each((_i, el) => {
    const li = $(el);
    const link = li.find('.job-title a, h3 a').first();
    const href = link.attr('href');
    if (!href) return;
    const title = clean(link.text());
    if (!title) return;
    jobs.push({
      title,
      company: clean(li.find('.job-company, .company').first().text()),
      location: clean(li.find('.job-location, .location').first().text()),
      salary: clean(li.find('.job-salary, .salary').first().text()),
      description: clean(li.find('.job-desc, .desc').first().text()),
      sourceUrl: absoluteUrl(href, baseUrl),
      applyUrl: absoluteUrl(href, baseUrl),
      postedAt: parseDate(li.find('.job-date, .date').first().text()),
      jobType: clean(li.find('.job-type').first().text())
    });
  });
  if (jobs.length) return jobs;
  return extractJsonLdJobs($, baseUrl);
}

function parseEmploi($, baseUrl) {
  const jobs = [];
  $('article, .job, .offre, li.job-list-item').each((_i, el) => {
    const card = $(el);
    const link = card.find('a[href*="offre"], a[href*="job"], a[href*="emploi"], h2 a, h3 a').first();
    const href = link.attr('href');
    if (!href) return;
    const title = clean(link.text());
    if (!title) return;
    jobs.push({
      title,
      company: clean(card.find('.company, .employer, .entreprise').first().text()),
      location: clean(card.find('.location, .localisation, .ville').first().text()),
      salary: clean(card.find('.salary, .salaire').first().text()),
      description: clean(card.find('.desc, .description, p').first().text()),
      sourceUrl: absoluteUrl(href, baseUrl),
      applyUrl: absoluteUrl(href, baseUrl),
      postedAt: parseDate(card.find('.date, .posted').first().text()),
      jobType: clean(card.find('.type, .contract').first().text())
    });
  });
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
  const company = clean(raw.company).slice(0, 120);
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
}

async function enrichJob(job) {
  if (!job || !job.sourceUrl) return job;
  try {
    const html = await fetchPage(job.sourceUrl);
    const $ = cheerio.load(html);

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

    const salary = clean($('[class*="salary"], [class*="salaire"], [class*="wage"]').first().text());
    if (salary) job.salary = salary.slice(0, 120);

    const email = extractEmails(`${$.html()} ${job.description}`);
    if (email) job.contactEmail = email;

    if (job.postedAt === null) {
      const dateText = clean($('[class*="date"], time').first().text().replace(/posté le/i, ''));
      job.postedAt = parseDate(dateText);
    }
  } catch {
    // detail enrichment is best-effort
  }
  return job;
}

async function scrapeSource(source) {
  const url = source.searchUrl();
  const html = await fetchPage(url);
  const $ = cheerio.load(html);
  const rawJobs = source.parse($, url);
  const jobs = rawJobs
    .map((raw) => normalizeJob(raw, source.key, source.name))
    .filter(Boolean)
    .slice(0, MAX_PER_SOURCE);

  if (process.env.JOB_ENRICH_DETAILS !== 'false') {
    for (const job of jobs.slice(0, MAX_DETAIL_ENRICHMENT)) {
      await enrichJob(job);
      await new Promise((resolve) => setTimeout(resolve, 600));
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
    await new Promise((resolve) => setTimeout(resolve, POLITE_DELAY_MS));
  }
  return results;
}

module.exports = { scrapeAll, scrapeSource, SOURCES, normalizeJob };
