const { test } = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { generateDocx, TEMPLATES } = require('../services/documentService');

const sampleCV = {
  name: 'John Doe',
  email: 'john@example.com',
  phone: '+237 6XX XXX XXX',
  location: 'Douala, Cameroon',
  summary: 'Experienced professional with 5 years in customer service.',
  experience: [
    {
      title: 'Customer Service Agent',
      company: 'TechCorp Cameroon',
      dates: 'Jan 2022 - Dec 2023',
      bullets: [
        'Handled 50+ customer inquiries daily',
        'Resolved complaints with 95% satisfaction rate'
      ]
    }
  ],
  education: [
    {
      institution: 'University of Douala',
      degree: 'Bachelor in Business Administration',
      dates: '2018 - 2021',
      details: 'Mentioned in Dean\'s list'
    }
  ],
  skills: ['Customer Service', 'Microsoft Office', 'French', 'English'],
  languages: ['French', 'English'],
  additionalSections: [
    { title: 'Certifications', content: 'Google Customer Service Certificate' }
  ]
};

const sampleCoverLetter = 'Dear Hiring Manager,\n\nI am writing to express my interest in the Customer Service Representative position at your company.\n\nWith over 2 years of experience in customer service, I am confident in my ability to contribute to your team.\n\nBest regards,\nJohn Doe';

test('generateDocx produces an English docx buffer', async () => {
  const buffer = await generateDocx(sampleCV, sampleCoverLetter, 'en');
  assert.ok(buffer && buffer.length > 0);
  // .docx files start with PK (zip format)
  assert.equal(buffer[0], 0x50); // P
  assert.equal(buffer[1], 0x4B); // K
});

test('generateDocx produces a French docx buffer', async () => {
  const buffer = await generateDocx(sampleCV, sampleCoverLetter, 'fr');
  assert.ok(buffer && buffer.length > 0);
  assert.equal(buffer[0], 0x50);
  assert.equal(buffer[1], 0x4B);
});

test('generateDocx handles an empty CV gracefully', async () => {
  const buffer = await generateDocx({ name: 'Empty' }, '', 'en');
  assert.ok(buffer && buffer.length > 0);
});

test('generateDocx handles a CV with no experience', async () => {
  const cv = {
    name: 'Jane Doe',
    education: [{ institution: 'University', degree: 'BS', dates: '2020-2024' }],
    skills: ['Python', 'JavaScript']
  };
  const buffer = await generateDocx(cv, '', 'en');
  assert.ok(buffer && buffer.length > 0);
});

async function documentXml(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  return zip.file('word/document.xml').async('string');
}

test('generateDocx outputs an A4 page size (11906x16838 twips)', async () => {
  const buffer = await generateDocx(sampleCV, sampleCoverLetter, 'en');
  const xml = await documentXml(buffer);
  assert.match(xml, /<w:pgSz w:w="11906" w:h="16838"/);
});

test('generateDocx supports all templates and they produce distinct output', async () => {
  assert.deepEqual(TEMPLATES.sort(), ['bold', 'classic', 'creative', 'minimal', 'modern', 'professional']);
  const buffers = {};
  for (const tpl of TEMPLATES) {
    buffers[tpl] = await generateDocx(sampleCV, sampleCoverLetter, 'en', tpl);
    assert.ok(buffers[tpl].length > 0, `${tpl} template should produce output`);
  }
  const xml = {};
  for (const tpl of TEMPLATES) xml[tpl] = await documentXml(buffers[tpl]);
  // Heading colors differ per template
  assert.notEqual(xml.modern, xml.classic);
  assert.notEqual(xml.modern, xml.creative);
  assert.notEqual(xml.classic, xml.creative);
});

test('generateDocx falls back to modern for an unknown template', async () => {
  const buffer = await generateDocx(sampleCV, sampleCoverLetter, 'en', 'bogus');
  const xml = await documentXml(buffer);
  assert.match(xml, /2563EB/);
});

test('generateDocx uses French section headings for French output', async () => {
  const buffer = await generateDocx(sampleCV, sampleCoverLetter, 'fr');
  const xml = await documentXml(buffer);
  assert.match(xml, /EXPÉRIENCE/);
  assert.match(xml, /FORMATION/);
  assert.match(xml, /COMPÉTENCES/);
  assert.match(xml, /PROFIL/);
});
