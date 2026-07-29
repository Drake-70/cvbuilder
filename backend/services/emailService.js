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

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || '587', 10),
    secure: parseInt(SMTP_PORT || '587', 10) === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined
  });

  return transporter;
}

const FROM = process.env.SMTP_FROM || 'CVBoost <noreply@cvboost.app>';

async function sendMail({ to, subject, html, text }) {
  const transport = getTransporter();

  if (!transport) {
    logger.info(`[EMAIL — console only] To: ${to} | Subject: ${subject}`);
    logger.info(`[EMAIL body] ${text || html}`);
    return { success: true, consoleOnly: true };
  }

  try {
    const info = await transport.sendMail({ from: FROM, to, subject, html, text });
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
    en: 'Verify Your CVBoost Email',
    fr: 'Vérifiez votre email CVBoost'
  };

  const bodies = {
    en: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px;">
        <h2 style="color:#4f46e5;">Welcome to CVBoost!</h2>
        <p>Your account has been created. Here are your login details:</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:16px 0;">
          <p style="margin:0;"><strong>Email:</strong> ${email}</p>
        </div>
        <p>You can now log in and start tailoring your CV.</p>
        <a href="${verifyUrl}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0;">Log In</a>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
        <p style="color:#94a3b8;font-size:12px;">CVBoost — Tailor your CV with AI</p>
      </div>
    `,
    fr: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px;">
        <h2 style="color:#4f46e5;">Bienvenue sur CVBoost !</h2>
        <p>Votre compte a été créé. Voici vos identifiants de connexion :</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:16px 0;">
          <p style="margin:0;"><strong>Email :</strong> ${email}</p>
        </div>
        <p>Vous pouvez maintenant vous connecter et commencer à adapter votre CV.</p>
        <a href="${verifyUrl}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0;">Se Connecter</a>
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

module.exports = { sendMail, sendPasswordResetEmail, sendVerificationEmail };
