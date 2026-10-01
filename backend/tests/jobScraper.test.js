const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeJob,
  buildJobUpdate,
  guessCategory,
  toValidDate,
  expireStaleJobs,
  expiryDays
} = require('../services/jobScraper');
const Job = require('../models/Job');

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

test('buildJobUpdate revives a listing that had expired', () => {
  // The sweep only ever sets active:false, so a re-scrape has to clear both
  // flags or the job would flip back to expired on the very next cycle.
  const update = buildJobUpdate({
    title: 'Software Engineer',
    source: 'louma',
    sourceUrl: 'https://example.com/jobs/9',
    scrapedAt: new Date('2026-05-01T08:00:00.000Z')
  });
  assert.equal(update.active, true);
  assert.equal(update.expiredAt, null);
  assert.ok('expiredAt' in update, 'expiredAt must be present so it can be unset');
});

test('expiryDays defaults to 30 and survives a bad value', () => {
  const original = process.env.JOB_EXPIRY_DAYS;
  try {
    delete process.env.JOB_EXPIRY_DAYS;
    assert.equal(expiryDays(), 30);
    process.env.JOB_EXPIRY_DAYS = 'not-a-number';
    assert.equal(expiryDays(), 30, 'garbage must fall back to the default');
    process.env.JOB_EXPIRY_DAYS = '-5';
    assert.equal(expiryDays(), 30, 'a negative value must not expire everything');
    process.env.JOB_EXPIRY_DAYS = '7';
    assert.equal(expiryDays(), 7);
    process.env.JOB_EXPIRY_DAYS = '0';
    assert.equal(expiryDays(), 0, '0 must be honoured so the sweep can be turned off');
  } finally {
    if (original === undefined) delete process.env.JOB_EXPIRY_DAYS;
    else process.env.JOB_EXPIRY_DAYS = original;
  }
});

test('expireStaleJobs expires by last-seen date, not postedAt', async () => {
  const original = Job.updateMany;
  const calls = [];
  try {
    Job.updateMany = async (filter, update) => {
      calls.push({ filter, update });
      return { modifiedCount: 4 };
    };
    const now = Date.parse('2026-05-01T12:00:00.000Z');
    const result = await expireStaleJobs({ days: 30, now });

    assert.equal(result.expired, 4);
    assert.equal(result.skipped, false);
    assert.equal(calls.length, 1);

    // Only active listings are swept, and age comes from scrapedAt. Using
    // postedAt would let a still-listed old job flip active/expired every cycle.
    assert.deepEqual(calls[0].filter.active, true);
    assert.equal(calls[0].filter.postedAt, undefined);
    assert.equal(calls[0].filter.scrapedAt.$ne, null);
    assert.equal(
      calls[0].filter.scrapedAt.$lte.toISOString(),
      '2026-04-01T12:00:00.000Z',
      'cutoff must be exactly 30 days before now'
    );

    // Soft flag only: nothing is removed from the collection.
    assert.equal(calls[0].update.$set.active, false);
    assert.equal(calls[0].update.$set.expiredAt.toISOString(), '2026-05-01T12:00:00.000Z');
    assert.equal(calls[0].update.$unset, undefined);
  } finally {
    Job.updateMany = original;
  }
});

test('expireStaleJobs is a no-op when expiry is disabled', async () => {
  const original = Job.updateMany;
  let called = false;
  try {
    Job.updateMany = async () => { called = true; return { modifiedCount: 0 }; };
    const result = await expireStaleJobs({ days: 0 });
    assert.equal(called, false, 'must not touch the database when disabled');
    assert.equal(result.skipped, true);
    assert.equal(result.expired, 0);
  } finally {
    Job.updateMany = original;
  }
});
