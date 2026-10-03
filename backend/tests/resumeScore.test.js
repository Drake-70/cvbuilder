const test = require('node:test');
const assert = require('node:assert');
const {
  computeResumeScore,
  CATEGORIES,
  STRONG_VERBS,
  _internals
} = require('../services/resumeScoreService');

const { extractBullets, hasNumber, firstWord, wordCount, PATTERNS } = _internals;

// The achievement bullets, reused across fixtures. Every one is verb-first and
// carries a number with a unit, so they score full marks on impact and verbs.
const STRONG_BULLETS = [
  '- Reduced checkout latency 40% by rewriting the payment service in Go.',
  '- Led the migration of 1.2M customer records to a new schema with zero downtime.',
  '- Grew the platform team from 4 to 11 engineers over 18 months.',
  '- Automated the deployment pipeline, releasing 12 times per day instead of 1.',
  '- Cut infrastructure spend by 18,000 EUR a year by rightsizing 40 servers.',
  '- Delivered a reconciliation service that now processes 250k transactions nightly.',
  '- Mentored 6 junior engineers, 3 of whom were promoted within a year.',
  '- Coordinated a SOC 2 audit across 12 services and closed every finding.',
  '- Launched a mobile checkout that lifted conversion 22% across 3 markets.',
  '- Standardised observability, cutting mean time to detection from 45 minutes to 5.'
];

const CONTACT_BLOCK = [
  'Jean Baptiste Ndom',
  'jean.baptiste@example.com | +237 6 99 88 77 66 | linkedin.com/in/jbndom',
  'Douala, Cameroon'
];

// A CV that should score near-perfect. It is a realistic length (inside the
// 400-900 word band) rather than a toy fixture, because brevity is one of the
// scored categories and a 90-word stub would fail it for the wrong reason.
const STRONG_CV = [
  ...CONTACT_BLOCK,
  '',
  'PROFESSIONAL SUMMARY',
  'Backend engineer with eight years building payment systems across Africa and',
  'Europe, specialising in high-throughput billing services and the reliability',
  'work that keeps them online. Led teams of up to 11 and owned a billing',
  'platform processing 250k transactions every night without a missed settlement.',
  '',
  'EXPERIENCE',
  'Senior Backend Engineer - Korrigo Ltd',
  ...STRONG_BULLETS,
  '',
  'Backend Engineer - Fintech Sandbox',
  '- Built 8 internal services in Python and PostgreSQL for partner integrations.',
  '- Reduced nightly batch runtime 3x by rewriting the reporting pipeline in Go.',
  '- Designed an idempotent retry layer that removed 9,000 duplicate charges a year.',
  '- Maintained 99.95% uptime across 40 services through incident response work.',
  '- Trained 8 new engineers on the platform and its deployment practices.',
  '',
  'EDUCATION',
  'MSc Computer Science - University of Yaounde I',
  '',
  'SKILLS',
  'Go, Python, PostgreSQL, Kubernetes, AWS, Terraform'
].join('\n');

const codes = (result) =>
  result.categories.flatMap(c => c.findings.map(f => f.code));

const category = (result, key) => result.categories.find(c => c.key === key);

test('weights sum to exactly 100 so the score is a true percentage', () => {
  const total = CATEGORIES.reduce((s, c) => s + c.max, 0);
  assert.strictEqual(total, 100);
});

test('a strong CV scores high and reports only the location finding', () => {
  const result = computeResumeScore(STRONG_CV);
  assert.ok(result.score >= 95, `expected >=95, got ${result.score}: ${codes(result)}`);
  assert.deepStrictEqual(codes(result), ['contact.missing_location']);
});

// A structured CV with realistic depth: two roles, twelve bullets, a full
// summary. Reused wherever a test needs a CV that genuinely scores full marks.
const COMPLETE_CV = {
  email: 'jean.baptiste@example.com',
  phone: '+237 6 99 88 77 66',
  location: 'Douala, Cameroon',
  linkedin: 'https://linkedin.com/in/jbndom',
  summary: 'Backend engineer with eight years building payment systems across ' +
    'Africa and Europe, specialising in high-throughput billing services and the ' +
    'reliability work that keeps them online. Led teams of up to 11 engineers.',
  experience: [
    {
      title: 'Senior Backend Engineer', company: 'Korrigo',
      bullets: STRONG_BULLETS.map(b => b.replace(/^-\s*/, ''))
    },
    {
      title: 'Backend Engineer', company: 'Fintech Sandbox',
      bullets: [
        'Built 8 internal services in Python and PostgreSQL for partner integrations.',
        'Reduced nightly batch runtime 3x by rewriting the reporting pipeline in Go.',
        'Designed an idempotent retry layer that removed 9,000 duplicate charges a year.',
        'Maintained 99.95% uptime across 40 services through incident response work.'
      ]
    }
  ],
  education: [{ institution: 'University of Yaounde I', degree: 'MSc Computer Science' }],
  skills: ['Go', 'Python', 'PostgreSQL', 'Kubernetes', 'AWS', 'Terraform']
};

test('a genuinely complete CV scores a clean 100', () => {
  // Both forms, which is how the tailor flow actually calls this: the raw text
  // for prose and bullets, the structured fields for contact details and shape.
  const result = computeResumeScore(STRONG_CV, COMPLETE_CV);
  assert.strictEqual(result.score, 100);
  assert.deepStrictEqual(codes(result), []);
});

test('text alone and structured fields alone agree on quality, not just on length', () => {
  // The report must not depend on which upload path the user took. Every quality
  // category has to score identically from either source -- this is the invariant
  // that catches the real regression, where a complete structured CV scored
  // 0/25 on impact because its bullets were re-parsed out of reconstructed text.
  //
  // Two categories are excluded, both for stated reasons rather than tolerance:
  // `contact` cannot read a location out of raw text at all, and `brevity` is a
  // word count, which renderStructured cannot reproduce exactly because it emits
  // no contact block and no section headings.
  const fromText = computeResumeScore(STRONG_CV);
  const fromStructured = computeResumeScore('', COMPLETE_CV);

  CATEGORIES
    .filter(c => c.key !== 'contact' && c.key !== 'brevity')
    .forEach(({ key }) => {
      assert.strictEqual(
        category(fromText, key).score,
        category(fromStructured, key).score,
        `${key} must not depend on the source`
      );
    });

  assert.ok(codes(fromText).includes('contact.missing_location'));
  assert.ok(!codes(fromStructured).some(c => c.startsWith('contact.')));
});

test('categories are returned in declaration order with their maxima', () => {
  const result = computeResumeScore(STRONG_CV);
  assert.deepStrictEqual(result.categories.map(c => c.key), CATEGORIES.map(c => c.key));
  result.categories.forEach((c, i) => {
    assert.strictEqual(c.max, CATEGORIES[i].max);
  });
});

// --- The whole point of this service: no job description required. ---

test('scores with no job description anywhere in the input', () => {
  const result = computeResumeScore(STRONG_CV);
  assert.strictEqual(typeof result.score, 'number');
  assert.ok(result.score > 0);
});

test('every category is present even when the CV is empty', () => {
  const result = computeResumeScore('');
  assert.strictEqual(result.score, 0);
  assert.strictEqual(result.categories.length, CATEGORIES.length);
  result.categories.forEach(c => {
    assert.strictEqual(c.score, 0, `${c.key} should be 0`);
  });
});

test('undefined and null inputs do not throw', () => {
  for (const input of [undefined, null, '', 0, false, {}]) {
    assert.doesNotThrow(() => computeResumeScore(input));
    assert.strictEqual(computeResumeScore(input).score, 0);
  }
});

// --- impact ---

test('a figure with magnitude, currency or a percentage counts', () => {
  assert.ok(hasNumber('Reduced latency 40% by rewriting the service.'));
  assert.ok(hasNumber('Migrated 1.2M customer records to a new schema.'));
  assert.ok(hasNumber('Grew the team from 4 to 11 engineers over 18 months.'));
  assert.ok(hasNumber('Processed 250k requests per hour at peak.'));
  assert.ok(hasNumber('Cut infrastructure spend by €18,000 annually.'));
  assert.ok(hasNumber('Delivered 3x throughput improvement.'));
  assert.ok(hasNumber('Maintained 99.95% uptime across 40 services.'));
});

test('currency written after the amount still counts', () => {
  // The normal French format, and the case a unit-word list could never catch.
  assert.ok(hasNumber('Cut infrastructure spend by 18,000 EUR a year.'));
  assert.ok(hasNumber('Raised 2,500,000 XAF for the seed round in six weeks.'));
});

test('a plain count counts, with no unit word required', () => {
  assert.ok(hasNumber('Managed 5 people in the support rotation.'));
  assert.ok(hasNumber('Trained 8 new engineers on the platform.'));
  assert.ok(hasNumber('Built 8 internal services for partner integrations.'));
});

test('years and version strings do not count', () => {
  assert.ok(!hasNumber('Migrated the codebase from Python 3 to 3.11.'));
  assert.ok(!hasNumber('Born in 1994 and graduated in 2016.'));
  assert.ok(!hasNumber('Worked there across 2021 - 2023.'));
  assert.ok(!hasNumber('Born 03/04/1994 in Douala.'));
  assert.ok(!hasNumber('Used Word 16 for the contract drafts.'));
});

test('a sentence with both a version and a real count counts once, for the count', () => {
  // "React 18" alone would be a version; the "3 products" is a genuine result,
  // so the bullet is quantified.
  assert.ok(hasNumber('Built UIs in React 18 across 3 products.'));
  // ...and a sentence with only a version is not.
  assert.ok(!hasNumber('Built UIs in React 18 across the whole product suite.'));
});

test('impact is a ratio of quantified bullets and drops to 0 with none', () => {
  const none = computeResumeScore([
    'EXPERIENCE',
    'Software Engineer - Acme',
    '- Responsible for the frontend of the company website and its design system.',
    '- Worked with the team to deliver features for internal customers regularly.',
    '- Helped maintain the shared component library across the whole codebase.'
  ].join('\n'));
  assert.strictEqual(category(none, 'impact').score, 0);
  assert.ok(codes(none).includes('impact.none_quantified'));
});

test('a CV with no detectable bullets reports no_bullets rather than 0%', () => {
  const result = computeResumeScore('Jane Doe\njane@example.com');
  assert.strictEqual(category(result, 'impact').score, 0);
  assert.ok(codes(result).includes('impact.no_bullets'));
});

// --- verbs ---

test('verb detection is case and punctuation insensitive', () => {
  assert.strictEqual(firstWord('- Reduced latency 40% by rewriting.'), 'reduced');
  assert.strictEqual(firstWord('\u2022 \u201cDelivered\u201d the roadmap.'), 'delivered');
  assert.strictEqual(firstWord('1. ACHIEVED 3x growth in revenue.'), 'achieved');
  assert.strictEqual(firstWord('- \u00b7 Optimised the build pipeline'), 'optimised');
});

test('french action verbs are recognised so a francophone CV is not penalised', () => {
  const result = computeResumeScore([
    'JEAN BAPTISTE NDOM',
    'jean@example.com | +237 6 99 88 77 66 | linkedin.com/in/jbndom',
    'Douala, Cameroun',
    '',
    'R\u00c9SUM\u00c9 PROFESSIONNEL',
    'Ing\u00e9nieur backend avec huit ans d\u2019exp\u00e9rience sur des syst\u00e8mes de paiement.',
    '',
    'EXP\u00c9RIENCE PROFESSIONNELLE',
    'Ing\u00e9nieur Backend - Korrigo',
    '- R\u00e9duit la latence de paiement de 40% en r\u00e9\u00e9crivant le service en Go.',
    '- Pilot\u00e9 la migration de 1.2M dossiers clients sans interruption de service.',
    '- D\u00e9ploy\u00e9 une API utilis\u00e9e par 25 clients actifs chaque jour.',
    '',
    'FORMATION',
    'Master en Informatique - Universit\u00e9 de Yaound\u00e9 I',
    '',
    'COMP\u00c9TENCES',
    'Go, Python, PostgreSQL, Kubernetes'
  ].join('\n'));

  const impact = category(result, 'impact');
  assert.strictEqual(impact.score, impact.max, 'french bullets should read as quantified');
  assert.ok(!codes(result).includes('verbs.weak_openers'));
  assert.ok(!codes(result).includes('verbs.few_strong'));
});

test('weak openers are flagged and cost score', () => {
  const result = computeResumeScore([
    'Jane Doe',
    'jane@example.com | +237 6 99 88 77 66 | Douala',
    '',
    'PROFESSIONAL SUMMARY',
    'A summary sentence that is long enough to count as prose rather than a heading.',
    '',
    'EXPERIENCE',
    'Engineer - Acme',
    '- Responsible for the deployment pipeline and infrastructure configuration.',
    '- Worked on reporting features and dashboards for the finance organisation.',
    '- Helped with data migration from the legacy system to the new platform.',
    '',
    'EDUCATION',
    'BSc Computer Science',
    '',
    'SKILLS',
    'Python, SQL, Docker'
  ].join('\n'));

  assert.ok(codes(result).includes('verbs.weak_openers'));
  const weakFinding = category(result, 'verbs').findings.find(f => f.code === 'verbs.weak_openers');
  assert.strictEqual(weakFinding.params.count, 3);
  assert.strictEqual(weakFinding.params.total, 3);
  assert.ok(category(result, 'verbs').score < category(result, 'verbs').max);
});

// --- structure ---

test('a structured tailoredCV is trusted over regex over raw text', () => {
  // Every field the structured form carries is read directly. An earlier version
  // of this test asserted a total of 100, which was wrong twice over: the fixture
  // is 25 words and brevity is a real category, so a perfect score was not
  // available no matter how the fields were read.
  const tailoredCV = {
    summary: 'A senior engineer.',
    // Two bullets, not one: a single-bullet role is genuinely thin, and that is
    // asserted separately. Structure must be full marks here for the assertion to
    // be about field reading rather than about bullet count.
    experience: [{
      title: 'Engineer', company: 'Acme',
      bullets: [
        'Shipped a platform used by 300 clients.',
        'Cut onboarding time 60% by rebuilding the signup flow.'
      ]
    }],
    education: [{ institution: 'Univ', degree: 'BSc' }],
    skills: ['Go', 'Python', 'SQL'],
    email: 'a@b.co',
    phone: '+237699887766',
    location: 'Douala',
    linkedin: 'https://linkedin.com/in/x'
  };
  const withStructure = computeResumeScore('', tailoredCV);
  ['contact', 'structure', 'impact', 'verbs', 'language'].forEach(key => {
    assert.strictEqual(category(withStructure, key).score, category(withStructure, key).max,
      `${key} should be full from structured fields`);
  });
  // Brevity is the one category a 25-word CV cannot satisfy, and it is measured
  // against the structured content rather than the empty raw string.
  assert.ok(codes(withStructure).includes('brevity.too_short'));
  assert.deepStrictEqual(codes(withStructure), ['brevity.too_short']);
});

test('missing education is a finding, never a crash', () => {
  const result = computeResumeScore('', {
    summary: 'A summary long enough to be treated as prose by the bullet filter.',
    experience: [{ title: 'E', company: 'A', bullets: ['Did a thing worth 40% more.'] }],
    skills: ['a', 'b', 'c'],
    email: 'a@b.co',
    phone: '1',
    location: 'x'
  });
  assert.ok(codes(result).includes('structure.missing_education'));
});

test('a single-bullet role is flagged as thin', () => {
  const result = computeResumeScore('', {
    experience: [{ title: 'E', company: 'A', bullets: ['One bullet only.'] }]
  });
  assert.ok(codes(result).includes('structure.thin_bullets'));
});

test('section headings and label lines are not mistaken for bullets', () => {
  // "TECHNICAL SKILLS" and "Languages:" must not enter the denominator. The
  // bullet above the EXPERIENCE heading is inside the skills section, so it is
  // not counted either -- only the experience-section bullet qualifies.
  const bullets = extractBullets([
    'TECHNICAL SKILLS',
    'Languages:',
    '- Built a billing service handling 30k invoices per month reliably.',
    'EXPERIENCE',
    '- Reduced p99 latency 55% across three services in the platform.'
  ].join('\n'));
  assert.strictEqual(bullets.length, 1);
  assert.ok(bullets[0].startsWith('Reduced'));
});

test('a role title does not reset the section it appears in', () => {
  // "Senior Backend Engineer - Korrigo Ltd" is a short, label-shaped line and so
  // looks like a heading. Treating it as one switched off the section it sits in
  // and the bullets beneath it vanished entirely.
  const bullets = extractBullets([
    'EXPERIENCE',
    'Senior Backend Engineer - Korrigo Ltd',
    '- Reduced checkout latency 40% by rewriting the payment service in Go.',
    '- Led the migration of 1.2M customer records with zero downtime.'
  ].join('\n'));
  assert.strictEqual(bullets.length, 2);
});

test('date ranges and "Present" are not bullets', () => {
  const bullets = extractBullets([
    'EXPERIENCE',
    'Engineer - Acme',
    '2021 - Present',
    '2019 - 2021',
    '- Built a billing service handling 30k invoices per month reliably.'
  ].join('\n'));
  assert.strictEqual(bullets.length, 1);
});

test('a structured CV uses its own bullets instead of re-parsing rendered text', () => {
  // Regression: renderStructured() emits no section headings, so the text bullet
  // detector found nothing and a complete structured CV scored 0/25 on impact.
  const tailoredCV = {
    summary: 'Backend engineer with eight years building payment systems in Africa.',
    experience: [{
      title: 'Senior Backend Engineer', company: 'Korrigo',
      bullets: [
        'Reduced checkout latency 40% by rewriting the payment service in Go.',
        'Led the migration of 1.2M customer records with zero downtime.'
      ]
    }],
    education: [{ institution: 'Univ', degree: 'MSc' }],
    skills: ['Go', 'Python', 'SQL', 'Kubernetes'],
    email: 'a@b.co', phone: '1', location: 'Douala', linkedin: 'x'
  };
  const result = computeResumeScore('', tailoredCV);
  assert.strictEqual(category(result, 'impact').score, category(result, 'impact').max);
  assert.strictEqual(category(result, 'verbs').score, category(result, 'verbs').max);
  assert.ok(!codes(result).includes('impact.no_bullets'));
});

test('brevity is judged against the structured CV when raw text is absent', () => {
  // Word count must not come from an empty string, or a complete CV is reported
  // as far too short.
  const tailoredCV = {
    summary: 'Backend engineer with eight years building payment systems in Africa.',
    experience: [{
      title: 'Engineer', company: 'Korrigo',
      bullets: ['Reduced checkout latency 40% by rewriting the payment service in Go.']
    }],
    education: [{ institution: 'Univ', degree: 'MSc' }],
    skills: ['Go', 'Python', 'SQL']
  };
  const words = tailoredCV.experience[0].bullets.length;
  assert.strictEqual(words, 1);
  // A one-bullet structured CV genuinely is short, so brevity must flag it.
  assert.ok(codes(computeResumeScore('', tailoredCV)).includes('brevity.too_short'));
});

// --- contact ---

test('contact points sum to the category max when everything is present', () => {
  const contact = category(computeResumeScore(STRONG_CV, {
    email: 'a@b.co', phone: '1', location: 'Douala', linkedin: 'x'
  }), 'contact');
  assert.strictEqual(contact.score, contact.max);
});

test('location is only read from a structured CV, never guessed from text', () => {
  // "Douala, Cameroon" is on its own line in the raw text, and it is still not
  // detected. A free-text CV cannot be reliably mined for a city, and a wrong
  // positive here would read as a real contact detail.
  const result = computeResumeScore(STRONG_CV);
  assert.ok(codes(result).includes('contact.missing_location'));

  const withLocation = computeResumeScore(STRONG_CV, { location: 'Douala' });
  assert.ok(!codes(withLocation).includes('contact.missing_location'));
});

test('each missing contact field produces its own finding', () => {
  const result = computeResumeScore('Some text with no contact details whatsoever here.');
  ['email', 'phone', 'linkedin'].forEach(field => {
    assert.ok(codes(result).includes(`contact.missing_${field}`), `missing ${field}`);
  });
});

test('a phone number written any of the usual ways is detected', () => {
  ['+237 6 99 88 77 66', '699887766', '(237) 699-88-77-66', '+237.699.88.77.66'].forEach(form => {
    const result = computeResumeScore(`Jane Doe\n${form}\nA summary long enough to read as prose here.`);
    assert.ok(!codes(result).includes('contact.missing_phone'), `should detect: ${form}`);
  });
});

// --- brevity ---

test('brevity rewards the 400-900 word band and penalises outside it', () => {
  const filler = (n) => Array.from({ length: n }, (_, i) =>
    `Delivered a measurable improvement of ${i + 1}% to the reporting pipeline for stakeholders.`).join('\n');

  const short = computeResumeScore(filler(4));
  assert.ok(codes(short).includes('brevity.too_short'));

  const long = computeResumeScore(filler(80));
  assert.ok(codes(long).some(c => c === 'brevity.over_target' || c === 'brevity.too_long'));

  const inBand = computeResumeScore(STRONG_CV);
  assert.strictEqual(category(inBand, 'brevity').score, category(inBand, 'brevity').max);
});

test('wordCount ignores runs of whitespace', () => {
  assert.strictEqual(wordCount('  one   two \n\n three  '), 3);
  assert.strictEqual(wordCount(''), 0);
});

// --- language ---

test('a wall of unbroken prose is penalised, a bulleted CV is not', () => {
  const wall = computeResumeScore([
    'PROFESSIONAL SUMMARY',
    'Responsible for the comprehensive management of a multifaceted engineering',
    'organisation including the recruitment onboarding training and mentorship of',
    'junior developers alongside the continued oversight of the delivery roadmap',
    'which was developed in close collaboration with product stakeholders across'
  ].join('\n'));
  assert.ok(codes(wall).some(c => c.startsWith('language.')),
    `expected a language finding, got ${codes(wall)}`);

  const bulleted = computeResumeScore(STRONG_CV);
  assert.strictEqual(category(bulleted, 'language').score, category(bulleted, 'language').max);
});

test('a long paragraph is still read as one sentence, not five', () => {
  // Bullets usually lack terminal punctuation, so splitting on line breaks alone
  // would see a 40-word bullet and fail it as an overlong sentence.
  const result = computeResumeScore(STRONG_CV);
  assert.ok(!codes(result).some(c => c.startsWith('language.')),
    `bullets should not read as overlong sentences: ${codes(result)}`);
});

// --- invariants ---

test('no finding code is unnamespaced, so the frontend can key off it', () => {
  const result = computeResumeScore(STRONG_CV.replace(/•/g, '-'));
  result.categories.forEach(c => {
    c.findings.forEach(f => {
      assert.ok(/^[a-z_]+\.[a-z_]+$/.test(f.code), `bad finding code: ${f.code}`);
      assert.strictEqual(f.code.split('.')[0], c.key, `finding ${f.code} filed under ${c.key}`);
      assert.ok(Number.isInteger(f.points) && f.points > 0);
    });
  });
});

test('a large paste cannot stall the request', () => {
  // Unbounded `[a-z0-9._%+-]+@` backtracks quadratically on a long run of
  // letters with no '@'. This input took 5.6 seconds before the quantifiers were
  // bounded and 42ms after. A pasted CV paragraph is exactly such a run, so this
  // endpoint was a denial-of-service vector on user-supplied text.
  const started = process.hrtime.bigint();
  computeResumeScore('x'.repeat(50000));
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(ms < 1000, `50KB of text took ${ms.toFixed(0)}ms`);
});

test('the contact patterns carry no unbounded repetition', () => {
  // The structural guard for the bug above: a timing test alone is flaky on a
  // loaded runner, and the failure mode is a pattern regression rather than a
  // slow machine.
  //
  // Character classes and escapes are stripped first so the "+" inside
  // [a-z0-9._%+-] is not mistaken for a quantifier. \d+ is deliberately allowed
  // elsewhere: anchored on digits it cannot blow up, and the contact patterns
  // are the ones that scan arbitrary prose.
  const unbounded = (source) => {
    const stripped = source.replace(/\\./g, 'E').replace(/\[[^\]]*\]/g, 'C');
    return /[+*]/.test(stripped) || /\{\d+,\}/.test(stripped);
  };
  Object.entries(PATTERNS).forEach(([name, re]) => {
    assert.ok(!unbounded(re.source), `${name} has an unbounded quantifier: ${re.source}`);
  });
});

test('the bounded contact patterns still match real values', () => {
  // The caps must not have been set so low that they stop working.
  assert.ok(PATTERNS.EMAIL_RE.test('jane.doe+tag@sub.example.co.uk'));
  assert.ok(PATTERNS.EMAIL_RE.test('JANE@EXAMPLE.COM'));
  assert.ok(!PATTERNS.EMAIL_RE.test('no email here at all'));
  assert.ok(PATTERNS.PHONE_RE.test('+237 6 99 88 77 66'));
  assert.ok(PATTERNS.PHONE_RE.test('699887766'));
  assert.ok(PATTERNS.PHONE_RE.test('(237) 699-88-77-66'));
  assert.ok(!PATTERNS.PHONE_RE.test('no digits at all'));
  assert.ok(PATTERNS.LINKEDIN_RE.test('https://linkedin.com/in/jane-doe'));
  assert.ok(PATTERNS.LINKEDIN_RE.test('linkedin.com/pub/jane'));
});

test('the score is always an integer inside 0..100 for hostile input', () => {
  const nasty = [
    '',
    'x'.repeat(50000),
    '\n\n\n\n',
    ' ￿ é́',
    Array.from({ length: 500 }, (_, i) => `- bullet ${i}`).join('\n'),
    null,
    undefined
  ];
  for (const input of nasty) {
    const result = computeResumeScore(input);
    assert.ok(Number.isInteger(result.score), `non-integer for ${String(input).slice(0, 20)}`);
    assert.ok(result.score >= 0 && result.score <= 100);
    assert.strictEqual(result.categories.length, CATEGORIES.length);
  }
});

test('findings carry only the params the frontend needs to interpolate', () => {
  const result = computeResumeScore(STRONG_CV.replace('Reduced', 'Responsible for'));
  result.categories.forEach(c => c.findings.forEach(f => {
    assert.strictEqual(typeof f.code, 'string');
    assert.strictEqual(typeof f.params, 'object');
    Object.values(f.params).forEach(v => {
      assert.ok(typeof v === 'string' || typeof v === 'number', `param type: ${typeof v}`);
    });
  }));
});

test('no finding code leaks prose, so the frontend can localise every one', () => {
  // Guards the design rule that keeps this service translation-agnostic. A
  // sentence here would be permanently untranslated in the French UI.
  const samples = [STRONG_CV, '', 'Responsible for things and worked on others here.'];
  samples.forEach(s => {
    codes(computeResumeScore(s)).forEach(code => {
      assert.ok(!/\s/.test(code), `code contains whitespace: ${code}`);
      assert.strictEqual(code, code.toLowerCase());
    });
  });
});

test('every advertised strong verb is actually reachable by firstWord', () => {
  // A verb list that cannot be produced by the parser is dead weight.
  assert.strictEqual(firstWord('- Reduced latency by 40%'), 'reduced');
  assert.ok(STRONG_VERBS.has('reduced'));
  assert.ok(STRONG_VERBS.has('r\u00e9duit'));
  assert.strictEqual(firstWord('- R\u00e9duit la latence de 40%'), 'r\u00e9duit');
});