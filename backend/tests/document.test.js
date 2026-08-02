const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateDocx } = require('../services/documentService');

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
