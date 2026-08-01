const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const multer = require('multer');
const User = require('../models/User');
const { sendPasswordResetEmail, sendVerificationEmail } = require('../services/emailService');
const logger = require('../utils/logger');

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
    phone: user.phone || '',
    location: user.location || '',
    jobTitle: user.jobTitle || '',
    company: user.company || '',
    subscriptionStatus: user.subscriptionStatus,
    documentsGeneratedCount: user.documentsGeneratedCount,
    freeDocumentCredits: user.freeDocumentCredits || 0,
    role: user.role || 'user',
    hasPassword: !!user.passwordHash,
    emailVerified: !!user.emailVerified
  };
}

function issueVerificationToken(user) {
  const token = crypto.randomBytes(32).toString('hex');
  user.emailVerificationToken = hashToken(token);
  user.emailVerificationExpires = new Date(Date.now() + VERIFICATION_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);
  return token;
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
        await existingUser.save();
        sendVerificationEmail({ email: existingUser.email, token, language: existingUser.preferredLanguage || 'en' }).catch(err => {
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

    // Send verification email (non-blocking)
    const token = issueVerificationToken(user);
    await user.save();
    sendVerificationEmail({ email: user.email, token, language: preferredLanguage || 'en' }).catch(err => {
      logger.error(`Verification email failed for ${user.email}: ${err.message}`);
    });

    res.status(201).json({ user: userResponse(user) });
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
    const { name, preferredLanguage, currentPassword, newPassword, bio, phone, location, jobTitle, company } = req.body;
    const user = await User.findById(req.user._id);

    if (name) user.name = name;
    if (preferredLanguage) user.preferredLanguage = preferredLanguage;
    if (bio !== undefined) user.bio = bio;
    if (phone !== undefined) user.phone = phone;
    if (location !== undefined) user.location = location;
    if (jobTitle !== undefined) user.jobTitle = jobTitle;
    if (company !== undefined) user.company = company;

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

    // Send reset email (non-blocking)
    sendPasswordResetEmail(user.email, token, user.preferredLanguage || 'en').catch(err => {
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
    await user.save();

    sendVerificationEmail({ email: user.email, token, language: user.preferredLanguage || 'en' }).catch(err => {
      logger.error(`Verification email failed for ${user.email}: ${err.message}`);
    });

    res.json({ message: 'Verification email sent' });
  } catch (err) {
    next(err);
  }
};

exports.googleLogin = async (req, res, next) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'Google credential is required' });

    let client;
    try {
      client = getGoogleClient();
    } catch {
      return res.status(501).json({ error: 'Google sign-in is not configured on this server' });
    }

    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const { email, name, sub: googleId, picture } = payload;

    if (!email) return res.status(400).json({ error: 'Google account must have an email' });

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

    const tokens = generateTokens(user._id);
    setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

    res.json({ user: userResponse(user) });
  } catch (err) {
    if (err.message?.includes('Token used too late') || err.message?.includes('Invalid token')) {
      return res.status(401).json({ error: 'Invalid Google credential' });
    }
    next(err);
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
