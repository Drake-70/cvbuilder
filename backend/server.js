const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Observability — Sentry is enabled only when SENTRY_DSN is set.
//
// This MUST stay above `require('express')`. expressIntegration() monkey-patches
// express, so initialising Sentry afterwards loads fine but silently leaves
// Express uninstrumented, and the SDK says so on startup:
//   "[Sentry] express is not instrumented. This is likely because you
//    required/imported express before calling Sentry.init()."
// dotenv still has to run first so SENTRY_DSN is readable.
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

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const sanitize = require('./middleware/sanitize');
const csrfProtection = require('./middleware/csrf');
const logger = require('./utils/logger');
const { cacheMiddleware, invalidateCache } = require('./middleware/cache');
const redis = require('./config/redis');
const { RedisStore } = require('rate-limit-redis');

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
const jobRoutes = require('./routes/jobs');
const pushRoutes = require('./routes/push');
const configRoutes = require('./routes/config');
const { startJobScheduler, stopJobScheduler } = require('./services/jobScraper');
const posthog = require('./config/posthog');
const pushConfig = require('./config/push');

const app = express();

app.set('trust proxy', 1);

// Security
// Security — CSP is declared in frontend/index.html meta tag (single source of truth)
// referrerPolicy must NOT be no-referrer or Google Identity Services rejects the button
// with "[GSI_LOGGER]: The given origin is not allowed for the given client ID".
app.use(helmet({
  contentSecurityPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// Compress JSON/static responses (gzip/br) — biggest transfer-size win
app.use(compression());

// CORS — supports a comma-separated list of origins, and falls back to the
// platform's own public URL so a deploy is never left allowing only localhost.
const allowedOrigins = require('./config/urls').allowedOrigins();

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

/**
 * Shared store for every rate limiter.
 *
 * Returns undefined when Redis is not configured, which makes express-rate-limit
 * fall back to its in-memory store. Without Redis the counters live per process:
 * they reset on every restart, which hands an attacker a fresh budget on each
 * deploy.
 *
 * `passOnStoreError` is set on the limiters themselves so a Redis outage fails
 * open. The alternative — every limiter returning 500 while Redis reconnects —
 * turns a caching problem into a total outage.
 */
function limiterStore(prefix) {
  if (!redis.isConfigured()) return undefined;
  return new RedisStore({
    prefix,
    sendCommand: (...args) => redis.getClient().call(...args)
  });
}

// Rate limiters
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 200 : 2000,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  store: limiterStore('cvboost:rl:general:'),
  passOnStoreError: true
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many AI requests. Please wait a moment before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
  store: limiterStore('cvboost:rl:ai:'),
  passOnStoreError: true
});

const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Too many payment attempts. Please wait before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
  store: limiterStore('cvboost:rl:payment:'),
  passOnStoreError: true
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 50 : 500,
  message: { error: 'Too many auth attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  store: limiterStore('cvboost:rl:auth:'),
  passOnStoreError: true
});

const contactLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Too many contact form submissions.' },
  standardHeaders: true,
  legacyHeaders: false,
  store: limiterStore('cvboost:rl:contact:'),
  passOnStoreError: true
});

// MongoDB readiness, driven by the background connection in start().
//
// The HTTP port is opened *before* MongoDB connects. A paused free-tier Atlas
// cluster can take longer than Render's port-open timeout, and blocking the
// listen on the connection made a slow database look like a dead container
// ("Application exited early") with no error in the log.
let mongoReady = false;
let mongoEverReady = false;

// Health check (cached 30s).
//
// Registered BEFORE the rate limiter on purpose. The general limiter allows
// 200 requests / 15 min in production, while Render probes every few seconds
// and restarts the instance after 60s of failed checks — so a rate-limited
// health endpoint means a restart loop.
//
// Always 200 while the process is up: this is a liveness probe. MongoDB state
// is reported in the body instead, because failing the probe during a cold
// database start would make the platform reject an otherwise healthy deploy.
//
// memoryOnly: Render polls this every few seconds, and this endpoint does no
// work worth caching. Sending those probes to Redis would spend a metered
// command on every health check for no benefit.
app.get('/api/health', cacheMiddleware(30, undefined, { memoryOnly: true }), (_req, res) => {
  res.json({
    status: 'ok',
    mongo: mongoReady ? 'connected' : (mongoEverReady ? 'reconnecting' : 'connecting'),
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development'
  });
});

app.use(generalLimiter);

// Body parsing
app.use(express.json({ limit: '1mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));
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
app.use('/api/jobs', jobRoutes);
// /public-key is deliberately unauthenticated inside the router; the rest of
// these routes declare their own requireAuth.
app.use('/api/push', pushRoutes);
// Runtime browser config (currently just the Google client ID). Unauthenticated:
// the login and register pages need it before anyone holds a session.
app.use('/api', configRoutes);

// Unknown API routes must 404 as JSON. The SPA catch-all below would otherwise
// answer them with index.html and HTTP 200, which hides typos from monitoring
// and makes an unreachable endpoint look healthy.
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
  // CDN-friendly caching: Vite emits content-hashed asset filenames (immutable),
  // index.html must revalidate, and everything else is safe to cache briefly.
  //
  // Vite's hash is base64url (A-Za-z0-9_-), not hex: a pattern like [a-f0-9]{8}
  // silently never matches (e.g. `index-CykKxNMw.js`), so hashed assets fell
  // through to the 1h rule and lost their immutable long cache.
  const hashedAsset = /[\\/]assets[\\/][^\\/]*-[A-Za-z0-9_-]{8}\.[^\\/]+$/;
  app.use(express.static(frontendDist, {
    maxAge: '1y',
    immutable: true,
    index: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (filePath.endsWith('sw.js')) {
        // The service worker script must never be cached long: a stale worker
        // keeps controlling the page and can serve a stale app shell.
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

// Error handler — registered last so it also covers failures raised by static
// file serving and res.sendFile, not just the API routes.
if (Sentry) Sentry.setupExpressErrorHandler(app);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

let server = null;

/**
 * Connect to MongoDB, retrying in the background until it succeeds.
 *
 * Runs *after* the HTTP port is open. A failed connection keeps the process
 * alive and retrying (with /api/health reporting `mongo: connecting`) instead of
 * exiting, so a cold or paused cluster produces a clear, greppable log line
 * rather than Render's opaque "Application exited early".
 */
async function connectWithRetry() {
  for (;;) {
    try {
      await connectDB();
      mongoReady = true;
      mongoEverReady = true;
      startJobScheduler();
      return;
    } catch (err) {
      logger.error(`[mongo] unavailable: ${err.message} — retrying in 15s`);
      await new Promise((resolve) => setTimeout(resolve, 15000));
    }
  }
}

const start = async () => {
  // Presence-only startup summary: which integrations this deploy actually has,
  // without ever printing a secret. Makes a missing/typo'd env var obvious.
  logger.info(
    `startup: env=${process.env.NODE_ENV || 'development'} `
    + `mongo=${process.env.MONGODB_URI ? 'configured' : 'MISSING'} `
    + `redis=${redis.isConfigured() ? 'configured' : 'off'} `
    + `sentry=${process.env.SENTRY_DSN ? 'on' : 'off'} `
    + `push=${pushConfig.isConfigured() ? 'on' : 'off'}`
  );

  // Bind the port first. Render treats a container that never opens its port as
  // a failed deploy and kills it; waiting on MongoDB here meant a slow database
  // killed the process before the reason could be logged.
  server = app.listen(PORT, HOST, () => {
    logger.info(`CVBoost server listening on ${HOST}:${PORT} [${process.env.NODE_ENV || 'development'}]`);
  });
  server.on('error', (err) => {
    logger.error(`HTTP server failed to start: ${err.message}`);
    process.exit(1);
  });

  await connectWithRetry();
};

let shuttingDown = false;

// Render (and Docker) send SIGTERM and then SIGKILL. Without a handler, every
// in-flight PDF/DOCX render and payment webhook is cut off mid-write.
const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received — shutting down gracefully`);

  stopJobScheduler();

  const forceExit = setTimeout(() => {
    logger.warn('graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 10000);
  if (forceExit.unref) forceExit.unref();

  const done = () => {
    Promise.resolve(flushLogs()).finally(() => {
      logger.info('shutdown complete');
      process.exit(0);
    });
  };

  if (server) server.close(done);
  else done();
};

async function flushLogs() {
  try {
    await posthog.flush();
  } catch { /* telemetry must never block shutdown */ }
  try {
    if (typeof logger.close === 'function') await logger.close();
  } catch { /* ignore */ }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error(`unhandled promise rejection: ${reason && reason.message ? reason.message : reason}`);
});

start();

module.exports = app;
