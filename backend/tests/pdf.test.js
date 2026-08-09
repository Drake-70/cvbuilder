const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generatePdf, PDF_TEMPLATES } = require('../services/pdfService');

const sampleCV = {
  name: 'John Doe',
  email: 'john@example.com',
  phone: '+237 6XX XXX XXX',
  location: 'Douala, Cameroon',
  summary: 'Experienced professional with 5 years in customer service.',
  experience: [{
    title: 'Customer Service Agent',
    company: 'TechCorp Cameroon',
    dates: 'Jan 2022 - Dec 2023',
    bullets: ['Handled 50+ customer inquiries daily', 'Resolved complaints with high satisfaction']
  }],
  education: [{ institution: 'University of Douala', degree: 'Bachelor in Business Administration', dates: '2018 - 2021' }],
  skills: ['Customer Service', 'Microsoft Office', 'French', 'English']
};

const sampleCoverLetter = 'Dear Hiring Manager,\nI am excited to apply for this role.';

test('generatePdf produces a valid PDF for every template', async () => {
  assert.deepEqual(PDF_TEMPLATES.sort(), ['bold', 'classic', 'creative', 'minimal', 'modern', 'professional']);
  for (const tpl of PDF_TEMPLATES) {
    const buffer = await generatePdf(sampleCV, sampleCoverLetter, 'en', tpl);
    assert.ok(buffer.length > 0, `${tpl} PDF should be non-empty`);
    assert.deepEqual([...buffer.slice(0, 5)].map(c => String.fromCharCode(c)).join(''), '%PDF-');
  }
});

test('generatePdf supports French output', async () => {
  const buffer = await generatePdf(sampleCV, sampleCoverLetter, 'fr', 'modern');
  assert.deepEqual([...buffer.slice(0, 5)].map(c => String.fromCharCode(c)).join(''), '%PDF-');
});

test('generatePdf falls back to modern for unknown template', async () => {
  const buffer = await generatePdf(sampleCV, sampleCoverLetter, 'en', 'bogus');
  assert.deepEqual([...buffer.slice(0, 5)].map(c => String.fromCharCode(c)).join(''), '%PDF-');
});

test('generatePdf handles an empty CV', async () => {
  const buffer = await generatePdf({}, '', 'en');
  assert.ok(buffer.length > 0);
});

test('generatePdf applies a watermark overlay', async () => {
  const clean = await generatePdf(sampleCV, sampleCoverLetter, 'en', 'modern');
  const marked = await generatePdf(sampleCV, sampleCoverLetter, 'en', 'modern', 'FREE PREVIEW');
  assert.deepEqual([...marked.slice(0, 5)].map(c => String.fromCharCode(c)).join(''), '%PDF-');
  assert.ok(marked.length > clean.length, 'watermarked PDF should contain extra drawing content');
});

test('generatePdf watermarks a multi-page document without breaking it', async () => {
  const longCV = {
    ...sampleCV,
    experience: Array.from({ length: 12 }, (_, i) => ({
      title: `Role ${i}`,
      company: 'Company',
      dates: '2020 - 2021',
      bullets: Array.from({ length: 4 }, (_, j) => `Bullet point ${j} for role ${i}`)
    }))
  };
  const buffer = await generatePdf(longCV, sampleCoverLetter, 'en', 'modern', 'APERÇU GRATUIT');
  assert.deepEqual([...buffer.slice(0, 5)].map(c => String.fromCharCode(c)).join(''), '%PDF-');
  assert.ok(buffer.length > 0);
});

test('generatePdf watermark works for French output and all templates', async () => {
  for (const tpl of PDF_TEMPLATES) {
    const buffer = await generatePdf(sampleCV, sampleCoverLetter, 'fr', tpl, 'APERÇU GRATUIT');
    assert.deepEqual([...buffer.slice(0, 5)].map(c => String.fromCharCode(c)).join(''), '%PDF-');
  }
});
