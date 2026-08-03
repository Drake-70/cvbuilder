require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const sanitize = require('./middleware/sanitize');
const csrfProtection = require('./middleware/csrf');
const logger = require('./utils/logger');
const posthog = require('./config/posthog');
const { setupExpressRequestContext } = require('posthog-node');
const { cacheMiddleware, invalidateCache } = require('./middleware/cache');

const authRoutes = require('./routes/auth');
const cvRoutes = require('./routes/cv');
const tailorRoutes = require('./routes/tailor');
const documentRoutes = require('./routes/document');
const paymentRoutes = require('./routes/payment');
const interviewRoutes = require('./routes/interview');
const scoreRoutes = require('./routes/score');
const previewRoutes = require('./routes/preview');
const linkedinRoutes = require('./routes/linkedin');
const referralRoutes = require('./routes/referral');
const ocrRoutes = require('./routes/ocr');
const guidanceRoutes = require('./routes/guidance');
const contactRoutes = require('./routes/contact');
const adminRoutes = require('./routes/admin');
const aiRoutes = require('./routes/ai');
const draftRoutes = require('./routes/draft');

const app = express();

if (posthog) {
  setupExpressRequestContext(posthog, app);
}

// Observability — Sentry is enabled only when SENTRY_DSN is set
let Sentry = null;
if (process.env.SENTRY_DSN) {
  Sentry = require('@sentry/node');
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.1,
    integrations: [Sentry.expressIntegration()]
  });
}

// Security
// Security — CSP is declared in frontend/index.html meta tag (single source of truth)
// referrerPolicy must NOT be no-referrer or Google Identity Services rejects the button
// with "[GSI_LOGGER]: The given origin is not allowed for the given client ID".
app.use(helmet({
  contentSecurityPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// CORS — supports comma-separated list of origins
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true
}));

const isProd = process.env.NODE_ENV === 'production';

// Rate limiters
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 200 : 2000,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many AI requests. Please wait a moment before trying again.' },
  standardHeaders: true,
  legacyHeaders: false
});

const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Too many payment attempts. Please wait before trying again.' },
  standardHeaders: true,
  legacyHeaders: false
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 50 : 500,
  message: { error: 'Too many auth attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

const contactLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Too many contact form submissions.' },
  standardHeaders: true,
  legacyHeaders: false
});

app.use(generalLimiter);

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// CSRF protection (must be after cookieParser)
app.use(csrfProtection);

// Input sanitization
app.use(sanitize);

// Logging
app.use(morgan('combined', {
  stream: { write: (msg) => logger.info(msg.trim()) }
}));

// Health check (cached 30s)
app.get('/api/health', cacheMiddleware(30), (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), env: process.env.NODE_ENV || 'development' });
});

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/cv', cvRoutes);
app.use('/api/tailor', aiLimiter, tailorRoutes);
app.use('/api/document', documentRoutes);
app.use('/api/payments', paymentLimiter, paymentRoutes);
app.use('/api/interview-prep', aiLimiter, interviewRoutes);
app.use('/api/score', scoreRoutes);
app.use('/api/preview', aiLimiter, previewRoutes);
app.use('/api/linkedin', aiLimiter, linkedinRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/ocr', ocrRoutes);
app.use('/api/guidance', guidanceRoutes);
app.use('/api/contact', contactLimiter, contactRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ai', aiLimiter, aiRoutes);
app.use('/api/drafts', draftRoutes);

// Error handler
if (Sentry) Sentry.setupExpressErrorHandler(app);
app.use(errorHandler);

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
  // CDN-friendly caching: Vite emits content-hashed asset filenames (immutable),
  // index.html must revalidate, and everything else is safe to cache briefly.
  const hashedAsset = /[\\/]assets\/[^\\/]+-[a-f0-9]{8}\./;
  app.use(express.static(frontendDist, {
    maxAge: '1y',
    immutable: true,
    index: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (hashedAsset.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }
    }
  }));
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

const PORT = process.env.PORT || 5000;

const start = async () => {
  await connectDB();
  app.listen(PORT, () => {
    logger.info(`CVBoost server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  });
};

start();

module.exports = app;
