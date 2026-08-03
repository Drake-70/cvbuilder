const test = require('node:test');
const assert = require('node:assert');
const { parseCVText, parseContact, isHeader } = require('../services/cvParser');

test('parses a simple English CV', () => {
  const text = [
    'MARIE NKAMGA',
    'Douala, Cameroon',
    'marie.nkamga@email.com',
    '+237 699 001 122',
    '',
    'SUMMARY',
    'Customer service representative with phone support experience.',
    '',
    'EXPERIENCE',
    'Customer Service Agent - Orange Cameroon (2019 - 2022)',
    '- Answered customer calls and resolved billing issues',
    '- Provided phone support',
    '',
    'EDUCATION',
    'BTS in Business Administration - Institut Universitaire (2017 - 2019)',
    '',
    'SKILLS',
    'Customer Service, Communication, Phone Support, Microsoft Office',
    '',
    'LANGUAGES',
    'French, English'
  ].join('\n');

  const cv = parseCVText(text);
  assert.strictEqual(cv.name, 'MARIE NKAMGA');
  assert.strictEqual(cv.email, 'marie.nkamga@email.com');
  assert.strictEqual(cv.phone, '+237 699 001 122');
  assert.match(cv.location, /Douala/i);
  assert.match(cv.summary, /customer service/i);
  assert.strictEqual(cv.experience.length, 1);
  assert.strictEqual(cv.experience[0].title, 'Customer Service Agent');
  assert.strictEqual(cv.experience[0].company, 'Orange Cameroon');
  assert.strictEqual(cv.experience[0].bullets.length, 2);
  assert.strictEqual(cv.education.length, 1);
  assert.ok(cv.skills.length >= 3);
  assert.strictEqual(cv.languages.length, 2);
});

test('parses a French CV', () => {
  const text = [
    'Jean Mbarga',
    'Yaoundé, Cameroun',
    'jean.mbarga@email.com',
    '6 99 11 22 33',
    '',
    'PROFIL',
    'Vendeur avec expérience en service client.',
    '',
    'EXPÉRIENCE',
    'Vendeur - Supermarché Casino (2018 - 2021)',
    '- Gestion des clients et des stocks',
    '',
    'FORMATION',
    'Baccalauréat - Lycée de Yaoundé (2014 - 2017)',
    '',
    'COMPÉTENCES',
    'Service client, Vente, Gestion des stocks'
  ].join('\n');

  const cv = parseCVText(text);
  assert.strictEqual(cv.name, 'Jean Mbarga');
  assert.strictEqual(cv.email, 'jean.mbarga@email.com');
  assert.match(cv.summary, /service client/i);
  assert.strictEqual(cv.experience.length, 1);
  assert.strictEqual(cv.education.length, 1);
  assert.ok(cv.skills.includes('Service client'));
});

test('handles a plain-text CV with no section headers', () => {
  const cv = parseCVText('John Doe\njohn@example.com\nSome summary sentence here.');
  assert.strictEqual(cv.name, 'John Doe');
  assert.strictEqual(cv.email, 'john@example.com');
});

test('extracts contact info', () => {
  const c = parseContact(['Aline Ngo Bassa', '+237 677 000 000', 'aline@example.com', 'Buea, Cameroon']);
  assert.strictEqual(c.name, 'Aline Ngo Bassa');
  assert.strictEqual(c.email, 'aline@example.com');
  assert.strictEqual(c.phone, '+237 677 000 000');
  assert.match(c.location, /Buea/i);
});

test('isHeader detects EN and FR section names', () => {
  assert.strictEqual(isHeader('Summary'), 'summary');
  assert.strictEqual(isHeader('Résumé'), 'summary');
  assert.strictEqual(isHeader('EXPERIENCE'), 'experience');
  assert.strictEqual(isHeader('Expérience Professionnelle'), 'experience');
  assert.strictEqual(isHeader('Education'), 'education');
  assert.strictEqual(isHeader('Formation'), 'education');
  assert.strictEqual(isHeader('Skills'), 'skills');
  assert.strictEqual(isHeader('Compétences'), 'skills');
  assert.strictEqual(isHeader('Languages'), 'languages');
  assert.strictEqual(isHeader('Langues'), 'languages');
  assert.strictEqual(isHeader('Not a section'), null);
});
