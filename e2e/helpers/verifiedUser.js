const path = require('path');

// Resolved the same way as e2e/password-reset.spec.js: mongoose is a backend
// dependency, not a root one, so a bare require('mongoose') from the e2e directory
// would not resolve.
const backendRoot = path.resolve(__dirname, '..', '..', 'backend');
const mongoose = require(path.join(backendRoot, 'node_modules', 'mongoose'));

/**
 * Marks a freshly registered user as verified by writing to Mongo directly.
 *
 * Every authenticated route is gated on emailVerified, and the e2e job runs a
 * Mongo service but no mail provider -- so neither the six-digit code nor the
 * emailed link is reachable from a test. Without this the suite stops at the
 * verification screen, which is the correct product behaviour and precisely why
 * this helper is needed rather than optional.
 *
 * This deliberately does NOT set REQUIRE_EMAIL_VERIFICATION=false to dodge the gate.
 * That would not even fix the navigation assertions -- the redirect to /verify-email
 * is driven by the login response (`emailVerified === false` in LoginPage and
 * RegisterPage), not by the middleware -- while silently disabling a security control
 * for the whole run. The specs that exercise the unverified path deliberately skip
 * this call.
 *
 * @param {string} email the address the test registered with, in any case
 * @returns {Promise<void>} resolves once the user is verified
 */
async function markEmailVerified(email) {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI must be set for the e2e suite (see .github/workflows/ci.yml)');
  }

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
    // Registered addresses are stored lowercased (see authController.register), so
    // the lookup has to match that or it silently updates nothing.
    const result = await mongoose.connection.db.collection('users').updateOne(
      { email: String(email).trim().toLowerCase() },
      { $set: { emailVerified: true } }
    );

    if (result.matchedCount !== 1) {
      // Failing loudly beats a 403 later: an unverified user otherwise produces a
      // confusing assertion failure somewhere else entirely, in a different spec.
      throw new Error(
        `markEmailVerified: no user found for "${email}" (matched ${result.matchedCount})`
      );
    }
  } finally {
    // Closed even when the update above throws, otherwise the pooled handle keeps
    // the worker process alive after the spec file finishes.
    await mongoose.disconnect().catch(() => {});
  }
}

module.exports = { markEmailVerified };
