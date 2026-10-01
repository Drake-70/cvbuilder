const nodemailer = require('nodemailer');
const axios = require('axios');
const logger = require('../utils/logger');
const { frontendUrl } = require('../config/urls');

let transporter = null;

const FROM = process.env.SMTP_FROM || 'CVBoost <noreply@cvboost.app>';

// Brevo's transactional API is reached over HTTPS on port 443, which no cloud
// provider blocks. This matters because Render blocks outbound SMTP (25/465/587)
// on free instances — see the platform changelog — so an SMTP transport there
// fails with a bare "Connection timeout" and no usable diagnostics.
const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

// Nodemailer waits 120s for an SMTP connection by default. Over a blocked port
// that is 120s of silence per email before anything is logged, so keep the
// HTTP path short and let it report a real reason.
const BREVO_TIMEOUT_MS = parseInt(process.env.BREVO_TIMEOUT_MS || '15000', 10);

/**
 * Split `CVBoost <noreply@cvboost.app>` into the shape Brevo expects.
 * Brevo rejects a `sender` it has not verified, so a malformed or unverified
 * FROM must fail loudly rather than silently produce an undeliverable message.
 */
function parseFrom(from) {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from || '');
  if (match) return { name: match[1] || undefined, email: match[2].trim() };
  return { email: (from || '').trim() };
}

/**
 * Minimal transport with the same `sendMail` contract as a nodemailer
 * transporter, so `sendMail()` below is unaware of which one is in use.
 */
function createBrevoTransport(apiKey) {
  return {
    kind: 'brevo-api',
    async sendMail({ from, to, subject, html, text, attachments }) {
      const payload = {
        sender: parseFrom(from),
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text
      };

      // Brevo takes attachments as { name, content } with base64 content.
      if (attachments && attachments.length) {
        payload.attachment = attachments.map((a) => ({
          name: a.filename,
          content: Buffer.isBuffer(a.content) ? a.content.toString('base64') : a.content
        }));
      }

      const response = await axios.post(BREVO_ENDPOINT, payload, {
        timeout: BREVO_TIMEOUT_MS,
        headers: {
          'api-key': apiKey,
          'content-type': 'application/json',
          accept: 'application/json'
        }
      });

      // Brevo answers 201 with the message id in a header, not the body.
      return {
        messageId: response.headers?.['x-message-id'] || response.data?.messageId || 'unknown'
      };
    }
  };
}

function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, BREVO_API_KEY } = process.env;

  // Prefer the HTTPS API: it works on every host, including platforms that
  // block outbound SMTP. This is the path a Render free instance must take.
  if (BREVO_API_KEY) {
    if (!SMTP_FROM) {
      logger.warn('BREVO_API_KEY is set but SMTP_FROM is not — Brevo will reject an unverified sender');
    }
    transporter = createBrevoTransport(BREVO_API_KEY);
    logger.info('Email transport: Brevo API over HTTPS (port 443)');
    return transporter;
  }

  if (!SMTP_HOST) {
    logger.warn('No BREVO_API_KEY and no SMTP_HOST — emails will be logged to console only');
    return null;
  }

  if (!SMTP_USER || !SMTP_PASS) {
    logger.warn('SMTP host set but no credentials — emails will be logged to console only');
    return null;
  }

  logger.info(`Email transport: SMTP ${SMTP_HOST}:${SMTP_PORT || '587'}`);
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || '587', 10),
    secure: parseInt(SMTP_PORT || '587', 10) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });

  return transporter;
}

async function sendMail({ to, subject, html, text, attachments }) {
  const transport = getTransporter();

  if (!transport) {
    logger.info(`[EMAIL — console only] To: ${to} | Subject: ${subject} | Attachments: ${(attachments || []).map(a => a.filename).join(', ') || 'none'}`);
    logger.info(`[EMAIL body] ${text || html}`);
    return { success: true, consoleOnly: true };
  }

  try {
    const info = await transport.sendMail({ from: FROM, to, subject, html, text, attachments });
    logger.info(`Email sent to ${to}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    // Distinguish the failure modes an operator actually has to act on. A bare
    // "Connection timeout" tells you nothing about which of these it is.
    let reason = err.message;
    if (transport.kind === 'brevo-api' && err.response) {
      const status = err.response.status;
      const apiMessage = err.response.data?.message;
      if (status === 401 || status === 403) {
        reason = `Brevo rejected the API key (${status}) — check BREVO_API_KEY`;
      } else if (status === 400 && /sender/i.test(apiMessage || '')) {
        reason = `Brevo rejected the sender "${FROM}" (${apiMessage}) — verify this address in Brevo, then set SMTP_FROM to match`;
      } else if (status === 429) {
        reason = 'Brevo rate limit reached';
      } else if (apiMessage) {
        reason = `Brevo ${status}: ${apiMessage}`;
      }
    } else if (transport.kind !== 'brevo-api' && /timeout|ETIMEDOUT|ENETUNREACH|EAI_AGAIN/i.test(reason)) {
      reason += ' — the host may block outbound SMTP (ports 25/465/587); set BREVO_API_KEY to send over HTTPS instead';
    }
    logger.error(`Email failed to ${to}: ${reason}`);
    return { success: false, error: reason };
  }
}

async function sendPasswordResetEmail(email, token, language = 'en') {
  const baseUrl = frontendUrl();
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;

  const subjects = {
    en: 'Reset Your CVBoost Password',
    fr: 'Réinitialisez votre mot de passe CVBoost'
  };

  const bodies = {
    en: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px;">
        <h2 style="color:#4f46e5;">Reset Your Password</h2>
        <p>You requested a password reset for your CVBoost account.</p>
        <p>Click the button below to set a new password. This link expires in 1 hour.</p>
        <a href="${resetUrl}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0;">Reset Password</a>
        <p style="color:#64748b;font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
        <p style="color:#94a3b8;font-size:12px;">CVBoost — Tailor your CV with AI</p>
      </div>
    `,
    fr: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px;">
        <h2 style="color:#4f46e5;">Réinitialisez votre mot de passe</h2>
        <p>Vous avez demandé la réinitialisation du mot de passe de votre compte CVBoost.</p>
        <p>Cliquez sur le bouton ci-dessous pour définir un nouveau mot de passe. Ce lien expire dans 1 heure.</p>
        <a href="${resetUrl}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0;">Réinitialiser</a>
        <p style="color:#64748b;font-size:13px;">Si vous n'avez pas fait cette demande, vous pouvez ignorer cet email.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
        <p style="color:#94a3b8;font-size:12px;">CVBoost — Adaptez votre CV avec l'IA</p>
      </div>
    `
  };

  return sendMail({
    to: email,
    subject: subjects[language] || subjects.en,
    html: bodies[language] || bodies.en,
    text: `Reset your CVBoost password: ${resetUrl}`
  });
}

async function sendVerificationEmail({ email, token, language = 'en' }) {
  const baseUrl = frontendUrl();
  const verifyUrl = `${baseUrl}/verify-email?token=${token}`;

  const subjects = {
    en: 'Verify your CVBoost email',
    fr: 'Vérifiez votre email CVBoost'
  };

  const bodies = {
    en: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px;">
        <h2 style="color:#4f46e5;">Welcome to CVBoost!</h2>
        <p>You're almost there. Confirm your email address to finish setting up your account.</p>
        <a href="${verifyUrl}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0;">Verify Email</a>
        <p style="color:#64748b;font-size:13px;">This link expires in 24 hours.</p>
        <p style="color:#64748b;font-size:13px;">If you didn't create a CVBoost account, you can safely ignore this email.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
        <p style="color:#94a3b8;font-size:12px;">CVBoost — Tailor your CV with AI</p>
      </div>
    `,
    fr: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px;">
        <h2 style="color:#4f46e5;">Bienvenue sur CVBoost !</h2>
        <p>Vous y êtes presque. Confirmez votre adresse email pour finaliser la création de votre compte.</p>
        <a href="${verifyUrl}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0;">Vérifier l'email</a>
        <p style="color:#64748b;font-size:13px;">Ce lien expire dans 24 heures.</p>
        <p style="color:#64748b;font-size:13px;">Si vous n'avez pas créé de compte CVBoost, vous pouvez ignorer cet email.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
        <p style="color:#94a3b8;font-size:12px;">CVBoost — Adaptez votre CV avec l'IA</p>
      </div>
    `
  };

  return sendMail({
    to: email,
    subject: subjects[language] || subjects.en,
    html: bodies[language] || bodies.en,
    text: `Welcome to CVBoost! Verify your email: ${verifyUrl}`
  });
}

async function sendPaymentReceiptEmail({ email, amount, currency = 'XAF', type = 'one-time', reference, provider, date, language = 'en', attachments }) {
  const providerLabel = provider === 'orange' ? 'Orange Money' : 'MTN MoMo';
  const typeLabel = type === 'subscription' ? 'Monthly subscription' : 'CV download';
  const typeLabelFr = type === 'subscription' ? 'Abonnement mensuel' : 'Téléchargement de CV';
  const formattedDate = date ? new Date(date).toLocaleString(language === 'fr' ? 'fr-CM' : 'en-GB') : '';

  const subjects = {
    en: `Payment confirmed — ${typeLabel}`,
    fr: `Paiement confirmé — ${typeLabelFr}`
  };

  const bodies = {
    en: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px;">
        <h2 style="color:#4f46e5;">Payment confirmed!</h2>
        <p>Thank you! Your payment was successful. Here are the details:</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:16px 0;">
          <p style="margin:0 0 6px;"><strong>Item:</strong> ${typeLabel}</p>
          <p style="margin:0 0 6px;"><strong>Amount:</strong> ${amount.toLocaleString('en-US')} ${currency}</p>
          <p style="margin:0 0 6px;"><strong>Paid via:</strong> ${providerLabel}</p>
          <p style="margin:0 0 6px;"><strong>Reference:</strong> ${reference}</p>
          ${formattedDate ? `<p style="margin:0;"><strong>Date:</strong> ${formattedDate}</p>` : ''}
        </div>
        <p>You can now continue on CVBoost.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
        <p style="color:#94a3b8;font-size:12px;">CVBoost — Tailor your CV with AI</p>
      </div>
    `,
    fr: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px;">
        <h2 style="color:#4f46e5;">Paiement confirmé !</h2>
        <p>Merci ! Votre paiement a été effectué avec succès. Voici les détails :</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:16px 0;">
          <p style="margin:0 0 6px;"><strong>Article :</strong> ${typeLabelFr}</p>
          <p style="margin:0 0 6px;"><strong>Montant :</strong> ${amount.toLocaleString('fr-FR')} ${currency}</p>
          <p style="margin:0 0 6px;"><strong>Paiement via :</strong> ${providerLabel}</p>
          <p style="margin:0 0 6px;"><strong>Référence :</strong> ${reference}</p>
          ${formattedDate ? `<p style="margin:0;"><strong>Date :</strong> ${formattedDate}</p>` : ''}
        </div>
        <p>Vous pouvez maintenant continuer sur CVBoost.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
        <p style="color:#94a3b8;font-size:12px;">CVBoost — Adaptez votre CV avec l'IA</p>
      </div>
    `
  };

  const attachmentNote = attachments && attachments.length > 0
    ? (language === 'fr'
        ? '<p style="color:#334155;font-weight:600;">Vos documents (CV et lettre de motivation) sont joints à cet email.</p>'
        : '<p style="color:#334155;font-weight:600;">Your documents (CV and cover letter) are attached to this email.</p>')
    : '';
  const htmlBody = (bodies[language] || bodies.en).replace(
    '<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />',
    `${attachmentNote}<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />`
  );

  return sendMail({
    to: email,
    subject: subjects[language] || subjects.en,
    html: htmlBody,
    text: `Payment confirmed (${amount} ${currency}): ${reference}`,
    attachments
  });
}

async function sendJobAlertEmail({ email, language = 'en', jobs }) {
  if (!jobs || !jobs.length) return { success: true, consoleOnly: true };

  const baseUrl = frontendUrl();
  const isFr = language === 'fr';

  const list = jobs.map((job) => {
    const title = (job.title || 'Job').replace(/</g, '&lt;');
    const company = (job.company || '').replace(/</g, '&lt;');
    const location = (job.location || 'Cameroon').replace(/</g, '&lt;');
    const url = `${baseUrl}/jobs/${job._id}`;
    return `<li style="margin:0 0 10px;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
      <a href="${url}" style="color:#4f46e5;font-weight:600;text-decoration:none;">${title}</a>
      <p style="margin:2px 0 0;color:#64748b;font-size:13px;">${company} — ${location}</p>
    </li>`;
  }).join('');

  const subjects = {
    en: `${jobs.length} new ${jobs.length > 1 ? 'jobs' : 'job'} match your alerts`,
    fr: `${jobs.length} nouvelle${jobs.length > 1 ? 's' : ''} offre${jobs.length > 1 ? 's' : ''} correspond${jobs.length > 1 ? 'ent' : ''} à vos alertes`
  };

  const bodies = {
    en: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px;">
        <h2 style="color:#4f46e5;">New jobs for you</h2>
        <p>These new job postings match your saved alerts:</p>
        <ul style="list-style:none;padding:0;margin:16px 0;">${list}</ul>
        <a href="${baseUrl}/jobs" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:8px 0;">Browse all jobs</a>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
        <p style="color:#94a3b8;font-size:12px;">CVBoost — Tailor your CV with AI</p>
      </div>
    `,
    fr: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px;">
        <h2 style="color:#4f46e5;">De nouvelles offres pour vous</h2>
        <p>Ces nouvelles offres d'emploi correspondent à vos alertes :</p>
        <ul style="list-style:none;padding:0;margin:16px 0;">${list}</ul>
        <a href="${baseUrl}/jobs" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:8px 0;">Voir toutes les offres</a>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
        <p style="color:#94a3b8;font-size:12px;">CVBoost — Adaptez votre CV avec l'IA</p>
      </div>
    `
  };

  return sendMail({
    to: email,
    subject: subjects[language] || subjects.en,
    html: bodies[language] || bodies.en,
    text: `New jobs match your alerts: ${baseUrl}/jobs`
  });
}

module.exports = { sendMail, sendPasswordResetEmail, sendVerificationEmail, sendPaymentReceiptEmail, sendJobAlertEmail };
