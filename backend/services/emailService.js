const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

  if (!SMTP_HOST) {
    logger.warn('SMTP not configured — emails will be logged to console only');
    return null;
  }

  if (!SMTP_USER || !SMTP_PASS) {
    logger.warn('SMTP host set but no credentials — emails will be logged to console only');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || '587', 10),
    secure: parseInt(SMTP_PORT || '587', 10) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });

  return transporter;
}

const FROM = process.env.SMTP_FROM || 'CVBoost <noreply@cvboost.app>';

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
    logger.error(`Email failed to ${to}: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function sendPasswordResetEmail(email, token, language = 'en') {
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
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
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
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

module.exports = { sendMail, sendPasswordResetEmail, sendVerificationEmail, sendPaymentReceiptEmail };
