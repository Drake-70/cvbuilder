#!/usr/bin/env node

/**
 * Promote an existing account to admin, for the case where there is no admin to
 * promote it.
 *
 * Why this exists
 *
 * `PATCH /api/admin/users/:id/role` is the supported way to change a role, and it
 * sits behind `requireAdmin`. That is correct — it is how a second admin is made,
 * and it is how a mistake is undone — but it also means a fresh database has no
 * path to its first admin. Everything else in the admin surface is unreachable
 * until one exists, so an install with zero admins is stuck at the login screen
 * with no in-product way forward. This script is the way in.
 *
 * Deliberately not an HTTP endpoint
 *
 * The obvious alternative is a `POST /api/admin/bootstrap` guarded by an env
 * secret. That leaves a standing unauthenticated write path in the production
 * surface forever, where the only thing standing between an attacker and full
 * admin is the secrecy of one environment variable. This script has no such
 * surface: it needs shell access to the machine or the database, and it cannot be
 * reached from the internet at all. Recovery after losing every admin account is a
 * rarer need than first-run setup, and it is one an operator with database access
 * can handle.
 *
 * Usage
 *
 *   node scripts/promoteAdmin.js                     list current admins
 *   node scripts/promoteAdmin.js you@example.com     dry run: show what would change
 *   node scripts/promoteAdmin.js you@example.com --apply   actually promote
 *
 * Run it from `backend/` so dotenv finds `.env`, and make sure `MONGODB_URI`
 * there points at the database you actually mean — the script prints the host and
 * database name before touching anything, so check them against what you expect
 * rather than assuming.
 *
 * It only ever promotes. Demotion stays behind the API, where the last-admin and
 * self-demotion guards apply and the change is written to the log.
 */

require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../config/db');

// Loaded after dotenv so the model picks up a configured MONGODB_URI if it needs
// one at load time.
const User = require('../models/User');

const APPLY_FLAG = '--apply';

function parseArgs(argv) {
  const args = argv.filter((a) => !a.startsWith('--'));
  const apply = argv.includes(APPLY_FLAG);
  const email = args[0] || null;
  return { email, apply };
}

/**
 * Describe the target without disclosing the credential.
 *
 * A full URI would put the password in the operator's scrollback and in any
 * terminal recording, so only the host and database name are shown — which is
 * what is actually needed to confirm the right database is being targeted.
 */
function describeTarget() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return 'MONGODB_URI is not set';

  try {
    const parsed = new URL(uri);
    return `${parsed.host}/${parsed.pathname.replace(/^\//, '') || 'default'}`;
  } catch {
    // Not parseable as a URL. Showing nothing beats showing a value that may
    // contain the credential, and the connection attempt will report the real
    // problem next.
    return 'an unparseable MONGODB_URI (not shown: it may contain a password)';
  }
}

async function listAdmins() {
  const [admins, total] = await Promise.all([
    User.find({ role: 'admin' }).select('email name createdAt').sort('createdAt').lean(),
    User.countDocuments()
  ]);

  console.log(`Database: ${describeTarget()}`);
  console.log(`Users: ${total}\n`);

  if (admins.length === 0) {
    console.log('No admins. To create the first one:');
    console.log('  node scripts/promoteAdmin.js <email> --apply');
    return;
  }

  console.log(`Admins (${admins.length}):`);
  for (const admin of admins) {
    console.log(`  ${admin.email}  (joined ${new Date(admin.createdAt).toISOString().slice(0, 10)})`);
  }
}

async function promote(email, apply) {
  // Lowercased to match the User schema, which lowercases on save. Searching for
  // the raw string would miss any account whose stored address was normalised.
  const normalized = String(email).trim().toLowerCase();

  const user = await User.findOne({ email: normalized }).select('email name role emailVerified');

  if (!user) {
    // Exit non-zero. A typo silently "succeeding" is the one failure mode worth
    // engineering against here: the operator would go on to check the dashboard,
    // find it unchanged, and have no reason to suspect this command.
    console.error(`No user with the email "${normalized}" in ${describeTarget()}.`);
    console.error('Register the account through the site first, then run this again.');
    return 1;
  }

  if (user.role === 'admin') {
    console.log(`${normalized} is already an admin. Nothing to do.`);
    return 0;
  }

  console.log(`Database: ${describeTarget()}`);
  console.log(`Found: ${normalized} (${user.name || 'no name'})`);
  console.log(`  role:           ${user.role} -> admin`);
  console.log(`  emailVerified:  ${user.emailVerified}`);
  console.log('  subscription:   unchanged');

  if (!apply) {
    console.log('\nDry run. Re-run with --apply to make this change.');
    return 0;
  }

  await User.updateOne({ _id: user._id }, { $set: { role: 'admin' } });

  console.log('\nPromoted. Sign out and back in — the role is read from the user record');
  console.log('on every admin request, but the session you already hold may predate it.');
  console.log('Then open /admin');
  return 0;
}

(async () => {
  const { email, apply } = parseArgs(process.argv.slice(2));

  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set. Run this from backend/ so .env is picked up.');
    process.exit(1);
  }

  await connectDB();

  const code = email ? await promote(email, apply) : await listAdmins().then(() => 0);

  await mongoose.disconnect();
  process.exit(code);
})().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});