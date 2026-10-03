const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Observability â€” Sentry is enabled only when SENTRY_DSN is set.
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
// Loaded for `transportStatus()` in the startup summary only. The service
// builds no transporter and opens no socket at require time.
const emailService = require('./services/emailService');

const app = express();

app.set('trust proxy', 1);

// Security
// Security â€” CSP is declared in frontend/index.html meta tag (single source of truth)
// referrerPolicy must NOT be no-referrer or Google Identity Services rejects the button
// with "[GSI_LOGGER]: The given origin is not allowed for the given client ID".
app.use(helmet({
  contentSecurityPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// Compress JSON/static responses (gzip/br) â€” biggest transfer-size win
app.use(compression());

// CORS â€” supports a comma-separated list of origins, and falls back to the
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

// Rate limiters share one store factory. It returns undefined when Redis is
// off, and otherwise binds to Redis on first use — see the module doc for why
// building the store at require time silently disables rate limiting.
const { limiterStore } = require('./middleware/rateLimitStore');

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

// Email-verification limiters, tighter than authLimiter's 50/15min.
//
// A six-digit code is a million possibilities, so the account-level cap of five
// attempts (`MAX_ATTEMPTS`) is the real control — but it resets on every resend,
// and a resend was previously bounded only by authLimiter. That combination let
// one IP pull 50 fresh codes in 15 minutes and spend five guesses on each, which
// is 250 attempts per quarter hour against one account. These two close the loop:
// resends are rationed per hour, and guesses are rationed separately so that
// hammering the code endpoint cannot be disguised as legitimate resends.
const verificationResendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isProd ? 6 : 100,
  message: { error: 'Too many verification emails requested. Try again in an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
  store: limiterStore('cvboost:rl:verify-resend:'),
  passOnStoreError: true
});

const verificationCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 20 : 200,
  message: { error: 'Too many code attempts. Wait a few minutes before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
  store: limiterStore('cvboost:rl:verify-code:'),
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
// and restarts the instance after 60s of failed checks â€” so a rate-limited
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
    // The live cache backend, so Redis can be confirmed without tailing logs
    // after a deploy. `configured` is deliberately not reported: a URL that
    // parses but cannot connect is exactly the case worth catching here.
    cache: redis.isReady() ? 'redis' : 'memory',
    // …and why not, when it isn't. `redis=configured` plus `cache: memory` on the
    // startup line says the URL parsed and nothing else; a socket that never
    // opens, a rejected password and an outage all look the same from outside.
    // Reported only when Redis is configured, so an app that does not use Redis
    // shows no Redis fields at all.
    ...(redis.isConfigured() ? { redis: redis.status() } : {}),
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
// Verification endpoints carry their own tighter limiters, mounted by path rather
// than declared inside the auth router so every limiter stays visible in one
// place. `app.use` rather than `app.post` so the limiter sees the request and then
// lets it fall through to the router that owns the handler.
app.use('/api/auth/resend-verification', verificationResendLimiter);
app.use('/api/auth/verify-email-code', verificationCodeLimiter);
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

// Error handler â€” registered last so it also covers failures raised by static
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
      logger.error(`[mongo] unavailable: ${err.message} â€” retrying in 15s`);
      await new Promise((resolve) => setTimeout(resolve, 15000));
    }
  }
}

/**
 * Whether an env var is actually usable, for the presence-only startup summary.
 *
 * A bare truthiness check reports an empty string as configured, and clearing a
 * field in the Render dashboard is the single most likely way to end up with
 * one â€” so `SENTRY_DSN=''` reported `sentry=on` while Sentry was off. Trim as
 * well, since a value that is only whitespace is the same mistake with extra
 * keystrokes.
 */
function isSet(name) {
  return Boolean(String(process.env[name] || '').trim());
}

const start = async () => {
  // Presence-only startup summary: which integrations this deploy actually has,
  // without ever printing a secret. Makes a missing/typo'd env var obvious.
  // `email=console` is the one to watch: every send "succeeds" and lands in this
  // log instead of a real inbox, so verification links silently never arrive.
  logger.info(
    `startup: env=${process.env.NODE_ENV || 'development'} `
    + `mongo=${isSet('MONGODB_URI') ? 'configured' : 'MISSING'} `
    + `redis=${redis.isConfigured() ? 'configured' : 'off'} `
    + `email=${emailService.transportStatus()} `
    + `sentry=${isSet('SENTRY_DSN') ? 'on' : 'off'} `
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
  logger.info(`${signal} received â€” shutting down gracefully`);

  stopJobScheduler();

  const forceExit = setTimeout(() => {
    logger.warn('graceful shutdown timed out â€” forcing exit');
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
