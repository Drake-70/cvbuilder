const axios = require('axios');
const cheerio = require('cheerio');
const Job = require('../models/Job');
const logger = require('../utils/logger');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
const REQUEST_TIMEOUT = envInt('JOB_SCRAPE_TIMEOUT_MS', 30000);
const DETAIL_TIMEOUT = envInt('JOB_DETAIL_TIMEOUT_MS', 45000);
const MAX_PER_SOURCE = envInt('JOB_MAX_PER_SOURCE', 30);
const MAX_DETAIL_ENRICHMENT = envInt('JOB_ENRICH_MAX', 12);
const POLITE_DELAY_MS = 1500;

function envInt(name, fallback) {
  const parsed = parseInt(process.env[name], 10);
  // A malformed value must degrade to the default rather than to NaN, which
  // would turn `.slice(0, NaN)` into "enrich nothing".
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const CATEGORY_KEYWORDS = {
  'IT & Software': ['developer', 'developpeur', 'software', 'ingénieur logiciel', 'data', 'devops', 'full stack', 'frontend', 'backend', 'programmeur', 'programmer', 'it support', 'réseau', 'network', 'security', 'sécurité', 'web', 'mobile', 'product manager', 'ux', 'ui', 'designer'],
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

/**
 * Strip diacritics so "Ingenieur Logiciel" and "Ingénieur logiciel" match the
 * same keyword. A large share of postings in this market are written without
 * accents, and the accented keyword list previously missed all of them.
 */
function foldAccents(text) {
  return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function guessCategory(title, description) {
  const blob = foldAccents(`${title} ${description}`).toLowerCase();
  for (const [category, pattern] of Object.entries(CATEGORY_PATTERNS)) {
    if (pattern.test(blob)) return category;
  }
  return 'Other';
}

// Every keyword is wrapped in \b so it can only match a whole word. Without
// this, "mobile" matched "Automobile", "hr" matched "thrh", and short tokens
// like "ui"/"web" matched inside unrelated words.
const CATEGORY_PATTERNS = Object.fromEntries(
  Object.entries(CATEGORY_KEYWORDS).map(([category, keywords]) => [
    category,
    new RegExp(
      keywords.map((k) => {
        const esc = foldAccents(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return `\\b${esc}\\b`;
      }).join('|'),
      'i'
    )
  ])
);

/**
 * Coerce anything to a real Date or null.
 *
 * Mongoose casts an `Invalid Date` into a CastError, and `bulkWrite` throws on
 * a cast error even with `ordered: false` — so one malformed `datePosted` used
 * to discard an entire source's results. Normalising here keeps bad dates out
 * of the write path entirely.
 */
function toValidDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isMissingDate(value) {
  return !toValidDate(value);
}

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
    // An unrecognised month abbreviation yields undefined, which would make
    // `new Date(year, undefined, day)` an Invalid Date.
    const month = months[dm[2]];
    if (month === undefined) return null;
    const year = dm[3] ? parseInt(dm[3], 10) : new Date().getFullYear();
    return toValidDate(new Date(year, month, parseInt(dm[1], 10)));
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
        postedAt: toValidDate(item.datePosted),
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
    postedAt: toValidDate(raw.postedAt),
    isRemote: detectRemote(title, description, location),
    category: guessCategory(title, description),
    scrapedAt: new Date()
  };
}

/**
 * Fetch a page with bounded retries.
 *
 * `attempts` is deliberately configurable per call site: detail pages run many
 * times per cycle, so burning 3 x 20s on a single dead detail link stalled the
 * whole source for over a minute. Timeouts are not retried — a socket that
 * already timed out will usually time out again.
 */
async function fetchPage(url, { timeout = REQUEST_TIMEOUT, attempts = 3 } = {}) {
  let lastErr = new Error(`request failed: ${url}`);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await sleep(jitter(3000) * Math.pow(2, attempt - 1));
    try {
      const res = await axios.get(url, {
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8'
        },
        timeout,
        responseType: 'text',
        maxRedirects: 5
      });
      return res.data;
    } catch (err) {
      lastErr = err;
      const isTimeout = err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT';
      if (isTimeout) break;
      if (attempt < attempts - 1) {
        const retryAfter = err.response && err.response.status === 429
          ? parseInt(err.response.headers['retry-after'] || '', 10)
          : NaN;
        const wait = Number.isFinite(retryAfter) ? retryAfter * 1000 : jitter(2500) * Math.pow(2, attempt);
        await sleep(Math.max(wait, 1500));
      }
    }
  }
  throw lastErr;
}

async function enrichJob(job) {
  if (!job || !job.sourceUrl) return job;
  try {
    const html = await fetchPage(job.sourceUrl, { timeout: DETAIL_TIMEOUT, attempts: 2 });
    const $ = cheerio.load(html);

    const jsonLd = extractJsonLdJobs($, job.sourceUrl)[0];
    if (jsonLd) {
      if (!job.company && jsonLd.company) job.company = cleanCompany(jsonLd.company).slice(0, 120);
      if (!job.location && jsonLd.location) job.location = jsonLd.location.slice(0, 160);
      if (!job.salary && jsonLd.salary) job.salary = jsonLd.salary.slice(0, 120);
      if (!job.jobType && jsonLd.jobType) job.jobType = jsonLd.jobType.slice(0, 80);
      if (isMissingDate(job.postedAt) && jsonLd.postedAt) job.postedAt = jsonLd.postedAt;
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

    // Only look inside the job body. Previously this scanned the entire page
    // HTML, so the board's own footer address (info@…, contact@…) was stored as
    // the employer's contactEmail on most listings.
    if (!job.contactEmail) {
      const $content = cheerio.load($.html());
      $content('script, style, noscript, header, footer, nav, form, .footer, [class*="footer"]').remove();
      const email = extractEmails(`${$content('body').text()} ${job.description}`);
      if (email) job.contactEmail = email;
    }

    if (isMissingDate(job.postedAt)) {
      const dateText = clean($('[class*="date"], time').first().text().replace(/posté le/i, ''));
      job.postedAt = parseDate(dateText);
    }

    job.category = guessCategory(job.title, job.description || '');
    job.isRemote = detectRemote(job.title, job.description || '', job.location || '');
  } catch (err) {
    // Enrichment is best-effort, but it must not be invisible: a source that
    // silently enriches nothing looks identical to a source that works.
    logger.warn(`[jobs] enrichment skipped for ${job.sourceUrl}: ${err.message}`);
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

  if (!jobs.length) {
    logger.warn(`[jobs] ${source.name}: page parsed but yielded 0 jobs — the layout likely changed or the source is blocking us`);
  }

  if (process.env.JOB_ENRICH_DETAILS !== 'false') {
    const needs = jobs.filter((job) => !job.company || !job.description || isMissingDate(job.postedAt));
    const targets = [...needs, ...jobs.filter((job) => !needs.includes(job))].slice(0, MAX_DETAIL_ENRICHMENT);
    for (const job of targets) {
      await enrichJob(job);
      await sleep(jitter(600));
    }
    logger.info(`[jobs] ${source.name}: enriched ${targets.length}/${jobs.length} listing(s)`);
  }
  return jobs;
}

/**
 * Build the `$set` payload for one job.
 *
 * Blank and null fields are omitted so a scrape that cannot parse something
 * this time does not erase what a previous, luckier scrape managed to store.
 * Previously `$set: { ...job }` blanked `postedAt` back to null whenever the
 * detail page went missing, silently degrading listings over time.
 */
function buildJobUpdate(job) {
  // `expiredAt: null` revives a listing that had aged out: the sweep below
  // only ever sets `active: false`, so a job still present on its source board
  // comes back on the next scrape instead of flip-flopping every cycle.
  const set = { scrapedAt: job.scrapedAt, active: true, expiredAt: null };
  for (const [field, value] of Object.entries(job)) {
    if (field === 'scrapedAt') continue;
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    set[field] = value;
  }
  return set;
}

async function upsertJobs(jobs) {
  if (!jobs.length) return { added: 0, updated: 0 };
  const ops = jobs.map((job) => ({
    updateOne: {
      filter: { sourceUrl: job.sourceUrl },
      update: { $set: buildJobUpdate(job) },
      upsert: true
    }
  }));

  let result;
  try {
    result = await Job.bulkWrite(ops, { ordered: false });
  } catch (err) {
    // A single malformed document fails the whole batch even with
    // `ordered: false`. Fall back to writing one at a time so the healthy
    // jobs still land instead of the source reporting a total loss.
    logger.warn(`[jobs] bulk upsert failed (${err.message}) — retrying ${jobs.length} job(s) individually`);
    let added = 0;
    let updated = 0;
    for (const job of jobs) {
      try {
        const single = await Job.updateOne(
          { sourceUrl: job.sourceUrl },
          { $set: buildJobUpdate(job) },
          { upsert: true }
        );
        if (single.upsertedCount) added += 1;
        else if (single.modifiedCount) updated += 1;
      } catch (singleErr) {
        logger.warn(`[jobs] skipped ${job.sourceUrl}: ${singleErr.message}`);
      }
    }
    return { added, updated, total: jobs.length };
  }

  return {
    added: result.upsertedCount || 0,
    updated: result.modifiedCount || 0,
    total: jobs.length
  };
}

/**
 * Age at which a listing is considered gone, in days.
 *
 * `0` (or any non-positive value) disables expiry entirely, so an operator can
 * turn the sweep off without a redeploy.
 */
function expiryDays() {
  const parsed = parseInt(process.env.JOB_EXPIRY_DAYS, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 30;
  return parsed;
}

/**
 * Deactivate listings that have not been seen by a scrape for `days` days.
 *
 * Age is measured from `scrapedAt` ("last seen"), deliberately not `postedAt`:
 *
 * - Most Cameroonian job boards do not expose a posting date, so `postedAt` is
 *   frequently null and those listings could never age out.
 * - Keying off `postedAt` would make a still-listed old job flip between active
 *   and expired on every cycle, because the scrape reactivates it and the sweep
 *   immediately expires it again.
 *
 * This is a soft flag, not a delete. `buildJobUpdate` sets `active: true` (and
 * clears `expiredAt`) whenever a scrape sees the job still listed, so a listing
 * that comes back revives itself with its view and apply counts intact. Nothing
 * is ever removed from the database.
 */
async function expireStaleJobs(options = {}) {
  const days = options.days === undefined ? expiryDays() : options.days;
  const now = options.now === undefined ? Date.now() : options.now;
  if (!Number.isFinite(days) || days <= 0) {
    return { expired: 0, skipped: true, days };
  }

  const cutoff = new Date(now - days * 24 * 60 * 60 * 1000);
  const result = await Job.updateMany(
    { active: true, scrapedAt: { $ne: null, $lte: cutoff } },
    { $set: { active: false, expiredAt: new Date(now) } }
  );

  const expired = result.modifiedCount || 0;
  if (expired > 0) {
    logger.info(`[jobs] expired ${expired} listing(s) not seen in the last ${days} day(s)`);
  }
  return { expired, skipped: false, days, cutoff };
}

// There are three independent triggers (GitHub Actions cron, the in-process
// scheduler, and the Admin UI button). Without a lock they overlap, which
// doubles the request load on both job boards and races the upserts.
let inFlight = null;
let scrapeTimer = null;
let scrapeInterval = null;

async function scrapeAll() {
  if (inFlight) {
    logger.info('[jobs] scrape already running — skipping duplicate trigger');
    return { skipped: true, startedAt: inFlight.startedAt };
  }
  const startedAt = new Date();
  inFlight = { startedAt, promise: null };
  try {
    const results = await runSources();
    return { skipped: false, startedAt, results };
  } finally {
    inFlight = null;
  }
}

async function runSources() {
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

function stopJobScheduler() {
  if (scrapeTimer) {
    clearTimeout(scrapeTimer);
    scrapeTimer = null;
  }
  if (scrapeInterval) {
    clearInterval(scrapeInterval);
    scrapeInterval = null;
  }
}

function startJobScheduler() {
  stopJobScheduler();
  if (process.env.JOB_SCRAPING_ENABLED === 'false') {
    logger.info('[jobs] in-process scheduler disabled (JOB_SCRAPING_ENABLED=false)');
    return;
  }
  const minutes = envInt('JOB_SCRAPE_INTERVAL_MINUTES', 360);
  const intervalMs = Math.max(minutes, 15) * 60 * 1000;
  logger.info(`[jobs] scheduler enabled — scraping every ${minutes} minutes`);
  // Delay the first run so boot is not competing with page load.
  scrapeTimer = setTimeout(() => {
    runScheduledCycle();
    // setInterval does not await the previous run; scrapeAll's in-flight lock
    // makes an overlapping tick a no-op instead of a double scrape.
    scrapeInterval = setInterval(runScheduledCycle, intervalMs);
  }, 60000);
  if (scrapeTimer.unref) scrapeTimer.unref();
  if (scrapeInterval && scrapeInterval.unref) scrapeInterval.unref();
}

async function runScheduledCycle() {
  try {
    const { runScrapeCycle } = require('./jobService');
    const cycle = await runScrapeCycle();
    if (cycle.skipped) {
      logger.info('[jobs] scheduled scrape skipped — a scrape was already in progress');
      return;
    }
    logger.info(`[jobs] scheduled scrape done: ${JSON.stringify(cycle.results)}`);
  } catch (err) {
    logger.error(`[jobs] scheduled scrape failed: ${err.message}`);
  }
}

module.exports = {
  scrapeAll,
  scrapeSource,
  runScheduledCycle,
  startJobScheduler,
  stopJobScheduler,
  expireStaleJobs,
  expiryDays,
  buildJobUpdate,
  guessCategory,
  toValidDate,
  SOURCES,
  normalizeJob
};
