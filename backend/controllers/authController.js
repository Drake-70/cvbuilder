const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const multer = require('multer');
const User = require('../models/User');
const { sendPasswordResetEmail, sendVerificationEmail } = require('../services/emailService');
const verificationCode = require('../services/verificationCode');
const logger = require('../utils/logger');
const posthog = require('../config/posthog');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
  }
});

let googleClient = null;
function getGoogleClient() {
  if (!googleClient) {
    const { OAuth2Client } = require('google-auth-library');
    googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }
  return googleClient;
}

const SALT_ROUNDS = 12;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VERIFICATION_TOKEN_EXPIRY_HOURS = 24;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateTokens(userId, tokenVersion = 0) {
  const accessToken = jwt.sign({ userId, tokenVersion }, process.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
  const refreshToken = jwt.sign({ userId, tokenVersion }, process.env.JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
  return { accessToken, refreshToken };
}

function userResponse(user) {
  return {
    id: user._id,
    email: user.email,
    name: user.name,
    preferredLanguage: user.preferredLanguage,
    avatar: user.avatar || '',
    bio: user.bio || '',
    summary: user.summary || '',
    phone: user.phone || '',
    location: user.location || '',
    jobTitle: user.jobTitle || '',
    company: user.company || '',
    linkedin: user.linkedin || '',
    website: user.website || '',
    savedSkills: Array.isArray(user.savedSkills) ? user.savedSkills : [],
    subscriptionStatus: user.subscriptionStatus,
    documentsGeneratedCount: user.documentsGeneratedCount,
    freeDocumentCredits: user.freeDocumentCredits || 0,
    role: user.role || 'user',
    hasPassword: !!user.passwordHash,
    emailVerified: !!user.emailVerified,
    // Reflected so the settings toggle shows the real stored state rather than
    // local component state, which would silently disagree after a failed save.
    dailyDigest: !!user.dailyDigest
  };
}

function issueVerificationToken(user) {
  const token = crypto.randomBytes(32).toString('hex');
  user.emailVerificationToken = hashToken(token);
  user.emailVerificationExpires = new Date(Date.now() + VERIFICATION_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);
  return token;
}

/**
 * Attach a fresh six-digit code to a user, in place.
 *
 * Returns the plaintext because it has to go into an email; nothing persists it.
 * The hashing happens here rather than at the call site so there is no path that
 * can accidentally save a raw code onto the document.
 */
async function issueVerificationCode(user) {
  const code = verificationCode.generateCode();
  const issue = await verificationCode.buildCodeIssue(code);
  user.emailVerificationCodeHash = issue.emailVerificationCodeHash;
  user.emailVerificationCodeExpires = issue.emailVerificationCodeExpires;
  user.emailVerificationCodeAttempts = issue.emailVerificationCodeAttempts;
  user.emailVerificationCodeSentAt = issue.emailVerificationCodeSentAt;
  return code;
}

/** Drop every trace of an outstanding code, called whenever verification succeeds. */
function clearVerificationCode(user) {
  Object.assign(user, verificationCode.clearCodeFields());
}

function setTokenCookies(res, accessToken, refreshToken) {
  const isProduction = process.env.NODE_ENV === 'production';

  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    maxAge: 15 * 60 * 1000
  });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

exports.register = async (req, res, next) => {
  try {
    const { email, password, name, preferredLanguage, referralCode } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      if (!existingUser.emailVerified) {
        const token = issueVerificationToken(existingUser);
        const code = await issueVerificationCode(existingUser);
        await existingUser.save();
        // This is the path a user reaches when the *first* verification email
        // never arrived, so it is the recovery route when mail is broken. It
        // still answers generically (`exists: true` is returned for any taken
        // address, verified or not) to avoid confirming which addresses are
        // registered; delivery failures are logged, not returned.
        //
        // Checked on the resolved value: `sendMail` resolves
        // `{ success: false }` and never rejects, so `.catch()` never fired.
        sendVerificationEmail({
          email: existingUser.email,
          token,
          code,
          language: existingUser.preferredLanguage || 'en'
        })
          .then((result) => {
            if (!result.success) {
              logger.error(
                `Re-verification email not delivered for ${existingUser.email}: ${result.error}`
              );
            }
          })
          .catch((err) => {
            logger.error(`Verification email failed for ${existingUser.email}: ${err.message}`);
          });
      }
      return res.json({ exists: true, message: 'If this email is available, a confirmation has been sent.' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await User.create({
      email: email.toLowerCase(),
      passwordHash,
      name,
      preferredLanguage: preferredLanguage || 'en',
      freeDocumentCredits: 1
    });

    // Apply referral code if provided
    if (referralCode) {
      const referralController = require('./referralController');
      referralController.applyReferralCode(referralCode, user._id).catch(err => {
        logger.error(`Referral code application failed for ${user.email}: ${err.message}`);
      });
    }

    const { accessToken, refreshToken } = generateTokens(user._id);
    setTokenCookies(res, accessToken, refreshToken);

    // Send verification email. Awaited, unlike most of the fire-and-forget calls
    // in this handler, because the response is the only place the user learns
    // whether to look at their inbox. `sendMail` signals failure by resolving
    // `{ success: false }`, so a `.catch()` here can never fire — which is how a
    // deploy with an unverified Brevo sender looks exactly like a working one:
    // signup succeeds, and every new account waits for a mail that is never sent.
    const token = issueVerificationToken(user);
    const code = await issueVerificationCode(user);
    await user.save();
    const verification = await sendVerificationEmail({
      email: user.email,
      token,
      code,
      language: preferredLanguage || 'en'
    }).catch((err) => {
      logger.error(`Verification email failed for ${user.email}: ${err.message}`);
      return { success: false, error: err.message };
    });

    // The account is created either way: the address is now taken, so failing
    // the request would tell the user to try a different one, and every retry
    // would hit the "already exists" path. `emailSent: false` instead lets the
    // UI say so while the account stays intact and a later resend can deliver.
    res.status(201).json({ user: userResponse(user), emailSent: verification.success });

    posthog.identify(user._id.toString(), {
      name: user.name,
      email: user.email,
      language: user.preferredLanguage || 'en'
    });
    posthog.capture('account_registered', user._id.toString(), {
      hasReferral: Boolean(referralCode)
    });
  } catch (err) {
    next(err);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    // Account lockout check
    if (user && user.lockoutUntil && user.lockoutUntil > new Date()) {
      const remaining = Math.ceil((user.lockoutUntil - new Date()) / 1000 / 60);
      return res.status(429).json({ error: `Account locked. Try again in ${remaining} minute(s).` });
    }

    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      user.loginAttempts = (user.loginAttempts || 0) + 1;
      if (user.loginAttempts >= 5) {
        user.lockoutUntil = new Date(Date.now() + 15 * 60 * 1000);
        user.loginAttempts = 0;
        await user.save();
        return res.status(429).json({ error: 'Account locked due to too many attempts. Try again in 15 minutes.' });
      }
      await user.save();
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Reset lockout on successful login
    if (user.loginAttempts || user.lockoutUntil) {
      user.loginAttempts = 0;
      user.lockoutUntil = null;
    }

    const tokens = generateTokens(user._id, user.tokenVersion);
    setTokenCookies(res, tokens.accessToken, tokens.refreshToken);
    await user.save();

    res.json({ user: userResponse(user) });

    posthog.identify(user._id.toString(), {
      name: user.name,
      email: user.email,
      language: user.preferredLanguage || 'en'
    });
    posthog.capture('user_logged_in', user._id.toString());
  } catch (err) {
    next(err);
  }
};

exports.refresh = async (req, res, next) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.userId).select('-passwordHash');
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Token rotation: reject if tokenVersion doesn't match
    if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== user.tokenVersion) {
      user.tokenVersion = (user.tokenVersion || 0) + 1;
      await user.save();
      return res.status(401).json({ error: 'Token has been revoked. Please log in again.' });
    }

    // Increment version to invalidate old refresh tokens
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    const tokens = generateTokens(user._id, user.tokenVersion);
    setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

    res.json({ user: userResponse(user) });
  } catch (err) {
    if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }
    next(err);
  }
};

exports.logout = async (_req, res) => {
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
  res.json({ message: 'Logged out successfully' });
};

exports.me = async (req, res) => {
  res.json({ user: userResponse(req.user) });
};

exports.updateMe = async (req, res, next) => {
  try {
    const { name, preferredLanguage, currentPassword, newPassword, bio, summary, phone, location, jobTitle, company, linkedin, website, savedSkills, dailyDigest } = req.body;
    const user = await User.findById(req.user._id);

    if (name) user.name = name;
    if (preferredLanguage) user.preferredLanguage = preferredLanguage;
    if (bio !== undefined) user.bio = bio;
    if (summary !== undefined) user.summary = summary;
    if (phone !== undefined) user.phone = phone;
    if (location !== undefined) user.location = location;
    if (jobTitle !== undefined) user.jobTitle = jobTitle;
    if (company !== undefined) user.company = company;
    if (linkedin !== undefined) user.linkedin = linkedin;
    if (website !== undefined) user.website = website;
    // `!== undefined` rather than truthiness, because false is the value that turns
    // the digest off and `if (dailyDigest)` would quietly refuse to do it.
    if (dailyDigest !== undefined) user.dailyDigest = !!dailyDigest;
    if (savedSkills !== undefined) {
      const cleaned = (Array.isArray(savedSkills) ? savedSkills : [])
        .map((s) => String(s).trim())
        .filter(Boolean);
      user.savedSkills = [...new Set(cleaned)].slice(0, 100);
    }

    if (currentPassword && newPassword) {
      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }
      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
      user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    }

    await user.save();
    res.json({ user: userResponse(user) });
  } catch (err) {
    next(err);
  }
};

exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    if (!EMAIL_REGEX.test(email)) return res.status(400).json({ error: 'Invalid email format' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.json({ message: 'If an account exists, a reset link has been sent' });

    const token = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();

    // Stays fire-and-forget AND generic on purpose. Reporting a delivery
    // failure to the caller would distinguish "this account exists but mail is
    // broken" from "no such account" — precisely the oracle the identical
    // message exists to prevent, and a usable account-enumeration probe. The
    // reason goes to the log instead, tagged with the flow it happened in so a
    // systematic mail outage is attributable.
    //
    // The result is inspected on the resolved value, not via `.catch()`:
    // `sendMail` resolves `{ success: false }` on failure and never rejects, so
    // the previous `.catch()` was dead code.
    sendPasswordResetEmail(user.email, token, user.preferredLanguage || 'en')
      .then((result) => {
        if (!result.success) {
          logger.error(`Password reset email not delivered for ${user.email}: ${result.error}`);
        }
      })
      .catch((err) => {
        logger.error(`Password reset email failed for ${user.email}: ${err.message}`);
      });

    res.json({ message: 'If an account exists, a reset link has been sent' });
  } catch (err) {
    next(err);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and password are required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() }
    });

    if (!user) return res.status(400).json({ error: 'Invalid or expired reset token' });

    user.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    next(err);
  }
};

exports.verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Verification token is required' });

    const user = await User.findOne({
      emailVerificationToken: hashToken(token),
      emailVerificationExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired verification link' });
    }

    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    // The code goes too. Verification is satisfied by whichever route the user
    // took, so leaving an outstanding six-digit code on a verified account would
    // hand anyone who later reads that mail a valid-looking (if inert) credential
    // and would keep the attempt counter occupied if it were ever needed again.
    clearVerificationCode(user);
    await user.save();

    res.json({ message: 'Email verified successfully' });
  } catch (err) {
    next(err);
  }
};

exports.resendVerification = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.emailVerified) return res.json({ message: 'Email already verified' });

    const token = issueVerificationToken(user);
    const code = await issueVerificationCode(user);
    await user.save();

    // Awaited, and checked on `success` rather than with `.catch()`.
    //
    // `sendMail` reports failure by *resolving* `{ success: false }` — it does
    // not reject — so the `.catch()` this replaces could never fire, and the
    // endpoint replied "Verification email sent" whether or not anything was
    // delivered. The user who explicitly clicked Resend was told a message was
    // on its way, and had no way to learn it had failed.
    const result = await sendVerificationEmail({
      email: user.email,
      token,
      code,
      language: user.preferredLanguage || 'en'
    }).catch((err) => {
      // Still needed: `sendMail` only guards the transport call, so a throw
      // from building the transport would otherwise escape unhandled.
      logger.error(`Verification email failed for ${user.email}: ${err.message}`);
      return { success: false, error: err.message };
    });

    if (!result.success) {
      // The caller here is the signed-in account itself, so naming the reason
      // carries no account-enumeration risk — unlike forgot-password, which
      // must stay generic. Both frontend call sites already surface
      // `data.error`, so this reaches the user without a UI change.
      return res.status(502).json({
        error: `Could not send the verification email: ${result.error}`,
        emailSent: false
      });
    }

    res.json({
      message: 'Verification email sent',
      emailSent: true,
      // The page runs a countdown from this rather than guessing a cooldown of its
      // own, so the server stays the single source of truth for when another send
      // is allowed. It is echoed from the value just written, not recomputed.
      resendAvailableInSeconds: verificationCode.RESEND_COOLDOWN_SECONDS
    });
  } catch (err) {
    next(err);
  }
};

/**
 * What the verification page needs to render itself.
 *
 * A dedicated endpoint rather than extra fields on `userResponse`, because this is
 * only meaningful to one page and only while unverified — and because
 * `emailVerificationCodeHash` must never reach a client at all. The response
 * carries the shape of the code's state, never the code.
 */
exports.verificationStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select(
      'emailVerified emailVerificationCodeExpires emailVerificationCodeAttempts emailVerificationCodeSentAt'
    );
    if (!user) return res.status(404).json({ error: 'User not found' });

    const attemptsUsed = user.emailVerificationCodeAttempts || 0;
    const expiresAt = user.emailVerificationCodeExpires
      ? new Date(user.emailVerificationCodeExpires).getTime()
      : 0;

    res.json({
      emailVerified: !!user.emailVerified,
      hasCode: Boolean(user.emailVerificationCodeHash),
      // Null when no code was ever issued or it has already lapsed, which is the
      // signal the page needs to hide the "expires in N minutes" hint rather than
      // display a countdown to zero.
      expiresInSeconds: expiresAt > Date.now()
        ? Math.ceil((expiresAt - Date.now()) / 1000)
        : null,
      attemptsRemaining: Math.max(0, verificationCode.MAX_ATTEMPTS - attemptsUsed),
      locked: attemptsUsed >= verificationCode.MAX_ATTEMPTS,
      resendAvailableInSeconds: user.emailVerified
        ? 0
        : verificationCode.resendCooldownRemaining(user.emailVerificationCodeSentAt)
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Verify with a six-digit code.
 *
 * Requires a session, and only ever loads `req.user`'s own record — so it cannot
 * be turned into an oracle that confirms whether some other address is
 * registered, which is what a `findOne({ code })` lookup would leak.
 *
 * Every failure returns 400 with the same wording. Distinguishing "wrong code"
 * from "expired" would be friendlier, but this endpoint is rate limited per
 * account by `MAX_ATTEMPTS` and by IP, and the honest per-reason messages are
 * what a correct client needs in order to show a useful countdown. The tension is
 * resolved in the page instead: it holds the specific reason from
 * `GET /verification-status` and this endpoint's job is only to say no.
 */
exports.verifyEmailCode = async (req, res, next) => {
  try {
    const normalized = verificationCode.normalizeCode(req.body?.code);
    if (!normalized) {
      return res.status(400).json({ error: `Enter the ${verificationCode.CODE_LENGTH}-digit code from your email` });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.emailVerified) return res.json({ message: 'Email already verified' });

    const verdict = await verificationCode.evaluateSubmission(user, normalized);

    if (!verdict.ok) {
      // Only a real mismatch burns an attempt. An expired or already-locked code
      // cannot be extended by guessing, so charging for it would punish a user for
      // a failure they had no way to avoid — and, worse, let an attacker who knows
      // a code is stale lock the account out on purpose.
      if (verdict.reason === 'mismatch') {
        user.emailVerificationCodeAttempts = (user.emailVerificationCodeAttempts || 0) + 1;
        await user.save();
      }

      logger.warn(
        `Verification code rejected for ${user.email}: ${verdict.reason} ` +
          `(attempts used ${(user.emailVerificationCodeAttempts || 0)}/${verificationCode.MAX_ATTEMPTS})`
      );

      return res.status(400).json({
        error: verdict.reason === 'locked'
          ? 'Too many incorrect attempts. Request a new code.'
          : 'That code is not valid or has expired.',
        reason: verdict.reason,
        attemptsRemaining: verdict.attemptsRemaining ?? 0
      });
    }

    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    clearVerificationCode(user);
    await user.save();

    res.json({ message: 'Email verified successfully' });
  } catch (err) {
    next(err);
  }
};

async function verifyGoogleCredential(credential) {
  const client = getGoogleClient();

  const ticket = await client.verifyIdToken({
    idToken: credential,
    audience: process.env.GOOGLE_CLIENT_ID
  });

  const payload = ticket.getPayload();
  const { email, name, sub: googleId } = payload;

  if (!email) {
    const err = new Error('Google account must have an email');
    err.googleNoEmail = true;
    throw err;
  }

  let user = await User.findOne({ $or: [{ googleId }, { email: email.toLowerCase() }] });

  if (user) {
    if (!user.googleId) {
      user.googleId = googleId;
      user.emailVerified = true;
      await user.save();
    }
  } else {
    user = await User.create({
      email: email.toLowerCase(),
      name: name || email.split('@')[0],
      googleId,
      preferredLanguage: 'en',
      emailVerified: true,
      freeDocumentCredits: 1
    });
  }

  return user;
}

exports.googleLogin = async (req, res, next) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'Google credential is required' });

    let user;
    try {
      user = await verifyGoogleCredential(credential);
    } catch (err) {
      if (err.googleNoEmail) return res.status(400).json({ error: err.message });
      if (err.message?.includes('Token used too late') || err.message?.includes('Invalid token')) {
        return res.status(401).json({ error: 'Invalid Google credential' });
      }
      throw err;
    }

    const tokens = generateTokens(user._id);
    setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

    res.json({ user: userResponse(user) });

    posthog.identify(user._id.toString(), {
      name: user.name,
      email: user.email,
      language: user.preferredLanguage || 'en'
    });
    posthog.capture('user_logged_in', user._id.toString(), { provider: 'google' });
  } catch (err) {
    if (err.message?.includes('Token used too late') || err.message?.includes('Invalid token')) {
      return res.status(401).json({ error: 'Invalid Google credential' });
    }
    next(err);
  }
};

exports.googleRedirect = async (req, res, next) => {
  try {
    const idToken = req.body?.credential || req.body?.id_token;
    if (!idToken) return res.redirect('/login?error=google_missing_credential');

    let user;
    try {
      user = await verifyGoogleCredential(idToken);
    } catch (err) {
      logger.error(`Google redirect sign-in failed: ${err.message}`);
      return res.redirect('/login?error=google_signin_failed');
    }

    const tokens = generateTokens(user._id);
    setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

    posthog.identify(user._id.toString(), {
      name: user.name,
      email: user.email,
      language: user.preferredLanguage || 'en'
    });
    posthog.capture('user_logged_in', user._id.toString(), { provider: 'google' });

    res.redirect(303, '/dashboard');
  } catch (err) {
    logger.error(`Google redirect sign-in error: ${err.message}`);
    res.redirect(303, '/login?error=google_signin_failed');
  }
};

exports.avatarUpload = upload.single('avatar');

exports.uploadAvatar = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image file provided' });

    const base64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    const user = await User.findById(req.user._id);
    user.avatar = base64;
    await user.save();

    res.json({ avatar: user.avatar });
  } catch (err) {
    next(err);
  }
};

exports.deleteAccount = async (req, res, next) => {
  try {
    const { password } = req.body;
    const user = await User.findById(req.user._id);

    if (user.passwordHash) {
      if (!password) return res.status(400).json({ error: 'Password is required to delete account' });
      const isMatch = await user.comparePassword(password);
      if (!isMatch) return res.status(401).json({ error: 'Incorrect password' });
    }

    const CV = require('../models/CV');
    const TailoredDocument = require('../models/TailoredDocument');
    const Payment = require('../models/Payment');
    const Referral = require('../models/Referral');

    await Promise.all([
      CV.deleteMany({ userId: user._id }),
      TailoredDocument.deleteMany({ userId: user._id }),
      Payment.deleteMany({ userId: user._id }),
      Referral.deleteMany({ $or: [{ referrerUserId: user._id }, { referredUserId: user._id }] }),
    ]);

    await User.findByIdAndDelete(user._id);

    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    next(err);
  }
};
