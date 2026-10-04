const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// The digest email interpolates job titles, company names and locations that come
// off scraped third-party pages. That makes the template's escaping a correctness
// property, not a style preference, and it is the kind of thing that stays invisible
// in review because the fixtures used to write it are all well behaved.
//
// Driven through the real Brevo code path with `axios` stubbed, rather than through
// the console-only fallback. That matters because sendMail logs `text || html`: on
// the fallback the HTML part is never observable at all, so the escaping assertions
// would have been passing against the text part while saying nothing about the HTML
// body an inbox actually renders.

const EMAIL = require.resolve('../services/emailService');
const LOGGER = require.resolve('../utils/logger');
const AXIOS = require.resolve('axios');

const logs = [];
const loggerStub = {
  info: (m) => logs.push(m),
  warn: (m) => logs.push(m),
  error: (m) => logs.push(m),
  debug: () => {}
};

const ORIGINAL = {
  FRONTEND_URL: process.env.FRONTEND_URL,
  BREVO_API_KEY: process.env.BREVO_API_KEY,
  SMTP_FROM: process.env.SMTP_FROM
};

let payloads = [];
const axiosStub = {
  async post(url, body) {
    payloads.push({ url, body });
    return { headers: { 'x-message-id': 'test-id' }, data: {} };
  }
};

let sendDailyDigestEmail;

before(() => {
  require.cache[LOGGER] = { id: LOGGER, filename: LOGGER, loaded: true, exports: loggerStub };
  require.cache[AXIOS] = { id: AXIOS, filename: AXIOS, loaded: true, exports: axiosStub };
  process.env.FRONTEND_URL = 'https://cvboost.example';
  // Selects the HTTPS transport, which is the one production uses and the only one
  // Render's free tier allows.
  process.env.BREVO_API_KEY = 'test-key';
  process.env.SMTP_FROM = 'CVBoost <noreply@cvboost.example>';
  delete require.cache[EMAIL];
  ({ sendDailyDigestEmail } = require(EMAIL));
});

after(() => {
  delete require.cache[LOGGER];
  delete require.cache[AXIOS];
  delete require.cache[EMAIL];
  for (const [key, value] of Object.entries(ORIGINAL)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

beforeEach(() => {
  logs.length = 0;
  payloads = [];
});

/** The exact payload handed to Brevo, so both parts of the message are visible. */
function sent() {
  const payload = payloads[payloads.length - 1];
  return {
    sentCount: payloads.length,
    subject: payload ? payload.body.subject : '',
    html: payload ? payload.body.htmlContent : '',
    text: payload ? payload.body.textContent : '',
    to: payload ? payload.body.to : [],
    sender: payload ? payload.body.sender : null
  };
}

const job = (over = {}) => ({
  _id: over._id || 'abc123',
  title: over.title || 'DevOps Engineer',
  company: over.company || 'Acme',
  location: over.location || 'Douala',
  active: over.active !== undefined ? over.active : true
});

describe('daily digest email', () => {
  test('renders one entry per job, linking to the board', async () => {
    await sendDailyDigestEmail({
      email: 'a@example.com',
      name: 'Ada',
      language: 'en',
      jobs: [job({ _id: 'j1' }), job({ _id: 'j2', title: 'Data Analyst', company: 'MTN' })],
      totalMatched: 2
    });

    const { subject, html } = sent();
    assert.match(subject, /^2 jobs matched your alerts/);
    assert.match(html, /DevOps Engineer/);
    assert.match(html, /Data Analyst/);
    assert.match(html, /MTN/);
    assert.match(html, /https:\/\/cvboost\.example\/jobs\/j1/);
    assert.match(html, /https:\/\/cvboost\.example\/jobs/);
  });

  test('addresses one recipient and the configured sender', async () => {
    await sendDailyDigestEmail({ email: 'a@example.com', language: 'en', jobs: [job()], totalMatched: 1 });
    const { to, sender } = sent();
    // A digest is addressed to the account it belongs to and nowhere else.
    assert.deepEqual(to, [{ email: 'a@example.com' }]);
    assert.equal(sender.email, 'noreply@cvboost.example');
  });

  test('says one job in the singular', async () => {
    await sendDailyDigestEmail({ email: 'a@example.com', language: 'en', jobs: [job()], totalMatched: 1 });
    assert.match(sent().subject, /^1 job matched your alerts/);
  });

  test('greets the user by name', async () => {
    await sendDailyDigestEmail({ email: 'a@example.com', name: 'Ada', language: 'en', jobs: [job()], totalMatched: 1 });
    assert.match(sent().html, /Hi Ada,/);
    assert.match(sent().text, /Hi Ada,/);
  });

  test('omits the greeting rather than saying "Hi ,", when there is no name', async () => {
    await sendDailyDigestEmail({ email: 'a@example.com', language: 'en', jobs: [job()], totalMatched: 1 });
    assert.doesNotMatch(sent().html, /Hi\s*,/);
    assert.doesNotMatch(sent().text, /Hi\s*,/);
  });

  test('admits the truncation instead of silently listing a subset', async () => {
    await sendDailyDigestEmail({
      email: 'a@example.com',
      language: 'en',
      jobs: Array.from({ length: 15 }, (_, i) => job({ _id: `j${i}`, title: `Role ${i}` })),
      totalMatched: 40
    });

    const { subject, html, text } = sent();
    // "40 matched" with 15 listed and no explanation reads as a broken email. Both
    // parts must say so, or a text-only client reads a different email.
    assert.match(subject, /40 jobs matched your alerts \(15 shown\)/);
    assert.match(html, /and 25 more on the board/);
    assert.match(text, /and 25 more on the board/);
  });

  test('says nothing about overflow when everything fitted', async () => {
    await sendDailyDigestEmail({ email: 'a@example.com', language: 'en', jobs: [job()], totalMatched: 1 });
    assert.doesNotMatch(sent().html, /more on the board/);
    assert.doesNotMatch(sent().text, /more on the board/);
  });

  test('labels an expired listing instead of hiding it', async () => {
    // The board still serves expired listings, so a digest that dropped them would
    // under-report what matched with no way for the user to tell.
    await sendDailyDigestEmail({
      email: 'a@example.com',
      language: 'en',
      jobs: [job({ active: false })],
      totalMatched: 1
    });

    const { html, text } = sent();
    assert.match(html, /DevOps Engineer/);
    assert.match(html, /expired/);
    assert.match(text, /\[expired\]/);
  });

  // Accented on purpose: the French strings are written with real accents to match
// the rest of the file, so a "resume" here would be the unaccented variant and the
// assertion below would pass against the wrong string.
const FRENCH_ACCENTS = ['résumé', 'Désactivez', 'paramètres', 'à vos alertes'];

test('the French version is French, accented, and localised throughout', async () => {
    await sendDailyDigestEmail({
      email: 'a@example.com',
      name: 'Ada',
      language: 'fr',
      jobs: [job({ _id: 'j1' }), job({ _id: 'j2' })],
      totalMatched: 2
    });

    const { subject, html, text } = sent();
    assert.match(subject, /^2 offres correspondent/);
    assert.match(html, /résumé quotidien/);
    assert.match(html, /Bonjour Ada,/);
    assert.match(html, /Voir toutes les offres/);
    assert.match(html, /Désactivez ceci dans les paramètres/);
    // The text part is a separate template and has to be localised on its own.
    assert.match(text, /nouvelles offres correspondent à vos alertes/);
    assert.match(text, /Voir toutes les offres/);

    // Every one of these appears unaccented nowhere in the message.
    for (const phrase of FRENCH_ACCENTS) {
      const stripped = phrase.normalize('NFD').replace(/[̀-ͯ]/g, '');
      assert.doesNotMatch(html, new RegExp(stripped), `"${stripped}" reached the HTML unaccented`);
      assert.doesNotMatch(text, new RegExp(stripped), `"${stripped}" reached the text unaccented`);
    }
  });

  test('the French overflow line is French too', async () => {
    await sendDailyDigestEmail({
      email: 'a@example.com',
      language: 'fr',
      jobs: [job({ _id: 'j1' })],
      totalMatched: 3
    });
    assert.match(sent().subject, /\(1 affichée\)/);
    assert.match(sent().html, /2 autre\(s\) sur la page/);
    assert.match(sent().text, /2 autre\(s\) sur la page/);
  });

  test('a truncated French subject agrees in number', async () => {
    // "(1 affichées)" shipped once. Plural agreement is not decoration in a subject
    // line the user reads on a lock screen.
    await sendDailyDigestEmail({
      email: 'a@example.com',
      language: 'fr',
      jobs: Array.from({ length: 15 }, (_, i) => job({ _id: `j${i}` })),
      totalMatched: 40
    });
    assert.match(sent().subject, /\(15 affichées\)/);
    assert.doesNotMatch(sent().subject, /\(15 affichée\)/);
  });

  test('renders French when a job has no location', async () => {
    await sendDailyDigestEmail({
      email: 'a@example.com',
      language: 'fr',
      jobs: [{ ...job(), location: '' }],
      totalMatched: 1
    });
    assert.match(sent().html, /Cameroun/);
  });

  test('sends nothing at all when there are no jobs', async () => {
    const out = await sendDailyDigestEmail({ email: 'a@example.com', jobs: [], totalMatched: 0 });
    assert.equal(out.consoleOnly, true);
    // No "0 jobs" email is generated.
    assert.equal(sent().sentCount, 0);
  });

  test('the plain-text alternative carries the links and no markup', async () => {
    // Some clients and most spam filters render this rather than the HTML, and a
    // digest whose text part is empty is a digest that reads as blank.
    await sendDailyDigestEmail({
      email: 'a@example.com',
      name: 'Ada',
      language: 'en',
      jobs: [job({ _id: 'j1' })],
      totalMatched: 1
    });

    const { text } = sent();
    assert.match(text, /Hi Ada,/);
    assert.match(text, /DevOps Engineer/);
    assert.match(text, /https:\/\/cvboost\.example\/jobs\/j1/);
    assert.doesNotMatch(text, /<a href=/, 'the text part must not contain markup');
  });
});

describe('daily digest email: scraped text is escaped', () => {
  // Scraper output is not trusted input. Titles and company names come from pages we
  // do not control, and these templates are built by concatenation, so an unescaped
  // value is an injection into an email body -- in a user's inbox, which is a
  // genuinely bad place for markup from someone else's job board.
  //
  // Both parts are checked. The HTML part must entity-encode the characters, and
  // the text part must not carry the markup at all; those are different
  // transformations and a fix that only addresses one of them is the interesting
  // half-done case.
  const HOSTILE = '<img src=x onerror="alert(1)">';

  test('an HTML tag in a job title cannot break out of the HTML body', async () => {
    await sendDailyDigestEmail({
      email: 'a@example.com',
      language: 'en',
      jobs: [job({ title: HOSTILE })],
      totalMatched: 1
    });

    const { html } = sent();
    // Stripped, not entity-encoded. The reader should see no trace of the tag at all
    // rather than a wall of "&lt;img src=x onerror=..." in the job title.
    assert.doesNotMatch(html, /<img/);
    assert.doesNotMatch(html, /&lt;img/);
    assert.doesNotMatch(html, /onerror/);
    // The job is still listed -- dropping it would hide a real match.
    assert.match(html, /Acme/);
  });

  test('the same tag is stripped from the text part', async () => {
    await sendDailyDigestEmail({
      email: 'a@example.com',
      language: 'en',
      jobs: [job({ title: HOSTILE })],
      totalMatched: 1
    });

    const { text } = sent();
    // Not escaped to "&lt;img" -- that is what the reader would literally see.
    assert.doesNotMatch(text, /<img/);
    assert.doesNotMatch(text, /&lt;img/);
  });

  test('a hostile company name is handled in both parts', async () => {
    await sendDailyDigestEmail({
      email: 'a@example.com',
      language: 'en',
      jobs: [job({ company: HOSTILE })],
      totalMatched: 1
    });
    assert.doesNotMatch(sent().html, /<img/);
    assert.doesNotMatch(sent().text, /<img/);
  });

  test('a hostile location is handled in both parts', async () => {
    await sendDailyDigestEmail({
      email: 'a@example.com',
      language: 'en',
      jobs: [job({ location: HOSTILE })],
      totalMatched: 1
    });
    assert.doesNotMatch(sent().html, /<img/);
    assert.doesNotMatch(sent().text, /<img/);
  });

  test('a hostile user name is handled in both parts', async () => {
    await sendDailyDigestEmail({
      email: 'a@example.com',
      name: HOSTILE,
      language: 'en',
      jobs: [job()],
      totalMatched: 1
    });
    assert.doesNotMatch(sent().html, /<img/);
    assert.doesNotMatch(sent().text, /<img/);
  });

  test('a script tag cannot be injected', async () => {
    await sendDailyDigestEmail({
      email: 'a@example.com',
      language: 'en',
      jobs: [job({ title: '<script>fetch("//evil")</script>' })],
      totalMatched: 1
    });

    const { html, text } = sent();
    assert.doesNotMatch(html, /<script/);
    assert.doesNotMatch(text, /<script/);
    // The payload survives only as inert visible text. That is the point of stripping
    // rather than escaping: the reader sees what the posting said, minus the tag,
    // and there is no element for it to execute in.
    assert.match(html, /fetch\(&quot;\/\/evil&quot;\)/);
    assert.doesNotMatch(html, /<script[\s>]/);
  });

  test('a quote in a job id cannot escape the href attribute', async () => {
    // The one field that lands inside an attribute rather than a text node, so the
    // attribute case is worth pinning separately from the text case.
    await sendDailyDigestEmail({
      email: 'a@example.com',
      language: 'en',
      jobs: [job({ _id: 'a" onmouseover="x' })],
      totalMatched: 1
    });

    const { html } = sent();
    assert.doesNotMatch(html, /onmouseover="x"/);
    // URL-encoded into the path rather than entity-encoded into the markup.
    assert.match(html, /a%22%20onmouseover%3D%22x/);
  });

  test('an entity the scraper already produced reads back correctly', async () => {
    // Round trip: stored as "Acme &amp; Sons", the reader sees "Acme & Sons" in both
    // parts rather than the literal entity.
    await sendDailyDigestEmail({
      email: 'a@example.com',
      language: 'en',
      jobs: [job({ company: 'Acme &amp; Sons' })],
      totalMatched: 1
    });

    const { html, text } = sent();
    assert.match(html, /Acme &amp; Sons/);
    assert.match(text, /Acme & Sons/);
    assert.doesNotMatch(text, /&amp;/);
  });

  test('plainText leaves ordinary job fields intact', async () => {
    // The stripping must not mangle the values that make a digest readable.
    const { plainText, htmlText, decodeEntities } = require(EMAIL);
    assert.equal(plainText('DevOps Engineer'), 'DevOps Engineer');
    assert.equal(plainText('Acme & Sons'), 'Acme & Sons');
    assert.equal(plainText('  spaced   out  '), 'spaced out');
    assert.equal(plainText(null), '');
    assert.equal(plainText(undefined), '');
    assert.equal(plainText('C++ <C> developer'), 'C++ developer');

    // An ampersand the user actually typed must survive as itself, not become an
    // entity the reader can see.
    assert.equal(htmlText('R&D Lead'), 'R&amp;D Lead');
    assert.equal(htmlText('a > b'), 'a &gt; b');
    assert.equal(htmlText(`say "hi"`), 'say &quot;hi&quot;');

    assert.equal(decodeEntities('Acme &amp; Sons'), 'Acme & Sons');
    assert.equal(decodeEntities('caf&eacute;'), 'café');
    assert.equal(decodeEntities('a&#32;b'), 'a b');
    // An unrecognised entity is left alone rather than swallowed.
    assert.equal(decodeEntities('a &notarealentity; b'), 'a &notarealentity; b');
  });

  test('an escaped entity cannot be used to smuggle a tag back in', async () => {
    // Decode-then-escape is safe precisely because the escape comes last. Stored
    // "&lt;img src=x onerror=alert(1)&gt;" decodes to a real tag, which must then be
    // stripped rather than re-escaped into something the reader sees as noise.
    await sendDailyDigestEmail({
      email: 'a@example.com',
      language: 'en',
      jobs: [job({ title: '&lt;img src=x onerror=alert(1)&gt;' })],
      totalMatched: 1
    });

    const { html, text } = sent();
    assert.doesNotMatch(html, /<img/);
    assert.doesNotMatch(html, /onerror/);
    assert.doesNotMatch(text, /<img/);
  });
});