const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeJob } = require('../services/jobScraper');

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
