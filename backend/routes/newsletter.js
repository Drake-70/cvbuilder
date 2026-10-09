const express = require('express');
const router = express.Router();
const axios = require('axios');
const logger = require('../utils/logger');

// Brevo Contacts API — same HTTPS-on-443 rationale as emailService (Render's
// free plan egress firewall blocks outbound SMTP, not ordinary HTTPS).
const CONTACTS_ENDPOINT = 'https://api.brevo.com/v3/contacts';
const BREVO_TIMEOUT_MS = parseInt(process.env.BREVO_TIMEOUT_MS || '15000', 10);

// Which Brevo list new subscribers land in. Default: the "Cameroon Launch"
// list that the launch campaigns are built against. Overridable per deploy
// so a staging environment can point at a test list.
const NEWSLETTER_LIST_ID = parseInt(
  String(process.env.BREVO_NEWSLETTER_LIST_ID || '').trim() || '3',
  10
);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * POST /api/newsletter  { email }
 *
 * Adds an opted-in address to the Brevo marketing list via the Contacts API
 * (updateEnabled: true keeps an existing contact subscribed instead of
 * erroring on a duplicate).
 */
router.post('/', async (req, res) => {
  const email = String(req.body && req.body.email ? req.body.email : '').trim().toLowerCase();

  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }
  if (!Number.isFinite(NEWSLETTER_LIST_ID)) {
    return res.status(500).json({ error: 'Server misconfigured: BREVO_NEWSLETTER_LIST_ID is not a number.' });
  }
  if (!process.env.BREVO_API_KEY) {
    logger.error('Newsletter subscribe rejected: BREVO_API_KEY is not set on this deploy');
    return res.status(503).json({ error: 'Newsletter is not configured on this server yet.' });
  }

  try {
    await axios.post(
      CONTACTS_ENDPOINT,
      { email, listIds: [NEWSLETTER_LIST_ID], updateEnabled: true },
      {
        timeout: BREVO_TIMEOUT_MS,
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'content-type': 'application/json',
          accept: 'application/json'
        }
      }
    );
    logger.info(`Newsletter subscribe OK: ${email} -> list ${NEWSLETTER_LIST_ID}`);
    return res.status(201).json({ ok: true });
  } catch (err) {
    let reason = err.message;
    if (err.response) {
      const status = err.response.status;
      const apiMessage = err.response.data && err.response.data.message;
      if (status === 401 || status === 403) {
        reason = 'Brevo rejected the API key — check BREVO_API_KEY';
      } else if (status === 429) {
        reason = 'Brevo rate limit reached';
      } else if (apiMessage) {
        reason = `Brevo ${status}: ${apiMessage}`;
      }
    }
    logger.error(`Newsletter subscribe failed (${email}): ${reason}`);
    return res.status(502).json({ error: 'Could not subscribe right now. Please try again later.' });
  }
});

module.exports = router;