const crypto = require('crypto');

// CSRF protection using double-submit cookie pattern.
// On GET: sets a csrfToken cookie (readable by JS).
// On state-changing methods: validates X-CSRF-Token header matches the cookie.

const CSRF_COOKIE = 'csrf-token';

function csrfProtection(req, res, next) {
  // Skip for webhook (external call without cookies)
  if (req.path === '/api/payments/webhook') return next();

  // Skip for auth routes that don't use cookies yet
  if (req.path.startsWith('/api/auth/')) {
    if (req.method === 'GET') setCsrfCookie(req, res);
    return next();
  }

  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    setCsrfCookie(req, res);
    return next();
  }

  // State-changing methods: validate token
  const cookieToken = req.cookies[CSRF_COOKIE];
  const headerToken = req.headers['x-csrf-token'];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }

  next();
}

function setCsrfCookie(req, res) {
  if (req.cookies[CSRF_COOKIE]) return;
  const token = crypto.randomBytes(24).toString('hex');
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000
  });
}

module.exports = csrfProtection;
