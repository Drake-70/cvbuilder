const path = require('path');

// Resolved the same way as e2e/helpers/verifiedUser.js: mongoose is a backend
// dependency, not a root one, so a bare require('mongoose') from the e2e directory
// would not resolve.
const backendRoot = path.resolve(__dirname, '..', '..', 'backend');
const mongoose = require(path.join(backendRoot, 'node_modules', 'mongoose'));

/**
 * Promotes a freshly registered user to an admin, verifying it on the way.
 *
 * Both fields are set in one update because both gates apply to the same request
 * chain: `/admin` sits behind `ProtectedRoute`, which requires a session, and every
 * authenticated route behind it is gated on `emailVerified`. Setting only the role
 * would park the test on the verification screen; setting only the flag would land
 * it on "Admin access required". The admin dashboard had no e2e coverage at all
 * until e2e/admin.spec.js, which is how a missing React import shipped as a
 * runtime ReferenceError while lint and build were both green.
 *
 * Like markEmailVerified, this writes to Mongo directly rather than relaxing a
 * check in the app: the e2e job runs a Mongo service and no mail provider, so
 * there is no in-band way to reach either state from a test.
 *
 * @param {string} email the address the test registered with, in any case
 * @returns {Promise<void>} resolves once the account is verified and promoted
 */
async function makeAdmin(email) {
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
      { $set: { emailVerified: true, role: 'admin' } }
    );

    if (result.matchedCount !== 1) {
      throw new Error(
        `makeAdmin: no user found for "${email}" (matched ${result.matchedCount})`
      );
    }
  } finally {
    // Closed even when the update above throws, otherwise the pooled handle keeps
    // the worker process alive after the spec file finishes.
    await mongoose.disconnect().catch(() => {});
  }
}

module.exports = { makeAdmin };
