const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeJob,
  buildJobUpdate,
  guessCategory,
  toValidDate
} = require('../services/jobScraper');

function companyFor(rawCompany) {
  const job = normalizeJob(
    { title: 'Test Job', sourceUrl: 'https://example.com/jobs/1', company: rawCompany },
    'louma',
    'Louma Jobs'
  );
  return job ? job.company : null;
}

test('normalizeJob keeps legitimate company names', () => {
  assert.equal(companyFor('MTN Cameroon'), 'MTN Cameroon');
  assert.equal(companyFor('Société Générale'), 'Société Générale');
  assert.equal(companyFor('TechnipFMC'), 'TechnipFMC');
});

test('normalizeJob drops generic aggregator placeholder companies', () => {
  assert.equal(companyFor('Offre D Emploi Jobinfocamer CamerJobs'), '');
  assert.equal(companyFor("Offre d'Emploi Recrutement Camer"), '');
  assert.equal(companyFor('LoumaJobs'), '');
  assert.equal(companyFor('Camerjobs Emploi'), '');
});

test('normalizeJob strips empty and token-only company names', () => {
  assert.equal(companyFor('   '), '');
  assert.equal(companyFor('X'), '');
  assert.equal(companyFor('Douala -'), 'Douala');
});

test('normalizeJob drops bogus company coming from JSON-LD enrichment', () => {
  const raw = {
    title: 'Assistant GRC',
    sourceUrl: 'https://example.com/jobs/2',
    company: 'Offre d Emploi Jobinfocamer CamerJobs'
  };
  const job = normalizeJob(raw, 'louma', 'Louma Jobs');
  assert.equal(job.company, '');
});

test('toValidDate rejects Invalid Date and unparseable input', () => {
  assert.equal(toValidDate(new Date('nonsense')), null);
  assert.equal(toValidDate('not-a-date'), null);
  assert.equal(toValidDate(undefined), null);
  assert.equal(toValidDate(null), null);

  const ok = toValidDate('2026-03-04T10:00:00.000Z');
  assert.equal(ok.toISOString(), '2026-03-04T10:00:00.000Z');
});

test('normalizeJob never emits an Invalid Date', () => {
  // A malformed datePosted used to reach Mongoose as `Invalid Date`, whose
  // CastError failed the entire bulkWrite for that source.
  const job = normalizeJob(
    {
      title: 'Data Analyst',
      sourceUrl: 'https://example.com/jobs/3',
      postedAt: new Date('garbage-date')
    },
    'goafrica',
    'Go Africa'
  );
  assert.equal(job.postedAt, null);
});

test('buildJobUpdate omits blank fields so enrichment is not erased', () => {
  const update = buildJobUpdate({
    title: 'Accountant',
    company: '',
    description: '   ',
    location: 'Douala',
    salary: null,
    postedAt: null,
    isRemote: false,
    category: 'Accounting & Finance',
    source: 'louma',
    sourceUrl: 'https://example.com/jobs/4',
    scrapedAt: new Date('2026-03-04T10:00:00.000Z')
  });

  // A scrape that could not parse these must not blank out what an earlier
  // successful scrape stored.
  assert.equal('company' in update, false);
  assert.equal('description' in update, false);
  assert.equal('salary' in update, false);
  assert.equal('postedAt' in update, false);

  assert.equal(update.title, 'Accountant');
  assert.equal(update.location, 'Douala');
  assert.equal(update.category, 'Accounting & Finance');
  assert.equal(update.source, 'louma');
  // false is a real value, not an absent one — it must survive.
  assert.equal(update.isRemote, false);
  // Re-activating on sight lets a relisted job come back.
  assert.equal(update.active, true);
  assert.equal(update.scrapedAt.toISOString(), '2026-03-04T10:00:00.000Z');
});

test('guessCategory matches whole words only', () => {
  // "mobile" used to match "Automobile" and mis-file sales roles as IT.
  assert.notEqual(guessCategory('Vendeur Automobile', 'Vente de vehicules'), 'IT & Software');
  // "engineer" was listed under IT as well, stealing civil/mechanical roles.
  assert.equal(guessCategory('Civil Engineer', 'Conception de routes'), 'Engineering');
  assert.equal(guessCategory('React Developer', 'Frontend React'), 'IT & Software');
  assert.equal(guessCategory('Comptable', 'Comptabilite generale'), 'Accounting & Finance');
  assert.equal(guessCategory('Ingenieur Logiciel', 'Developpement'), 'IT & Software');
});

test('guessCategory falls back to Other', () => {
  assert.equal(guessCategory('Poste indescriptible', 'Aucune information'), 'Other');
});
