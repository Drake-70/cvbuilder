/**
 * End-to-end check of the new admin surface against a live server and database.
 *
 * Not part of the test suite (the suite is unit/source based, and this needs a
 * running mongod plus a listening server). Run explicitly when the admin surface
 * changes, because the unit tests assert shape and invariants while this is the only
 * thing that proves a request actually completes.
 *
 *   node scripts/verify-admin-surface.js
 */
const path = require('path');
const mongoose = require(path.join(__dirname, '..', 'backend', 'node_modules', 'mongoose'));
const jwt = require(path.join(__dirname, '..', 'backend', 'node_modules', 'jsonwebtoken'));

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5099';
const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cvboost_admincheck';
const SECRET = process.env.JWT_SECRET || 'ci-jwt-secret';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` â€” ${detail}` : ''}`);
}

/** Minimal cookie jar: the API is cookie authenticated and CSRF protected. */
function makeJar() {
  const jar = new Map();
  return {
    get: () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '),
    set: (header) => {
      for (const part of String(header).split(',')) {
        const [pair] = part.split(';');
        const eq = pair.indexOf('=');
        if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
      }
    }
  };
}

async function call(jar, method, url, body, token) {
  const headers = { cookie: jar.get() };
  if (token) headers.cookie = `accessToken=${token}; ${headers.cookie}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const csrf = jar.get().match(/csrf-token=([^;]+)/);
  if (csrf && method !== 'GET') headers['X-CSRF-Token'] = decodeURIComponent(csrf[1]);

  const res = await fetch(`${BASE}${url}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (res.headers.get('set-cookie')) jar.set(res.headers.get('set-cookie'));

  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  return { status: res.status, data };
}

async function main() {
  await mongoose.connect(URI, { serverSelectionTimeoutMS: 8000 });

  const User = require(path.join(__dirname, '..', 'backend', 'models', 'User'));
  const Payment = require(path.join(__dirname, '..', 'backend', 'models', 'Payment'));
  const AdminAudit = require(path.join(__dirname, '..', 'backend', 'models', 'AdminAudit'));
  const TailoredDocument = require(path.join(__dirname, '..', 'backend', 'models', 'TailoredDocument'));

  await Promise.all([User, Payment, AdminAudit, TailoredDocument].map((m) => m.deleteMany({})));

  const admin = await User.create({
    email: 'admin@check.test',
    name: 'Admin Checker',
    passwordHash: 'x',
    emailVerified: true,
    role: 'admin'
  });
  const target = await User.create({
    email: 'target@check.test',
    name: 'Target User',
    passwordHash: 'x',
    emailVerified: true,
    freeDocumentCredits: 1,
    documentsGeneratedCount: 2
  });

  // Give the KPI aggregation something to aggregate.
  const now = new Date();
  await Promise.all([
    Payment.create({ userId: target._id, amount: 5000, currency: 'XAF', type: 'one-time', status: 'success', phoneNumber: '+237600000000', provider: 'mtn' }),
    Payment.create({ userId: target._id, amount: 2500, currency: 'XAF', type: 'one-time', status: 'failed', phoneNumber: '+237600000000', provider: 'mtn' }),
    TailoredDocument.create({ userId: target._id, tailoredContent: { summary: 'ok' } }),
    (async () => {
      const u = await User.findById(target._id);
      u.lastActiveAt = now;
      u.lastLoginAt = now;
      await u.save();
    })()
  ]);

  const token = (u) => jwt.sign({ userId: u._id.toString(), tokenVersion: u.tokenVersion || 0 }, SECRET, { expiresIn: '15m' });

  const jar = makeJar();
  const health = await call(jar, 'GET', '/api/health');
  check('server is up', health.status === 200, `status ${health.status}`);

  // --- KPIs ------------------------------------------------------------------
  const kpis = await call(jar, 'GET', '/api/admin/kpis?days=30', undefined, token(admin));
  check('GET /admin/kpis returns 200', kpis.status === 200, `status ${kpis.status}`);
  if (kpis.status === 200) {
    const d = kpis.data;
    check('kpis: series is label-aligned', d.series.signups.length === d.series.labels.length
      && d.series.revenue.length === d.series.labels.length
      && d.series.documents.length === d.series.labels.length);
    check('kpis: range states UTC', d.range.timezone === 'UTC');
    check('kpis: days are clamped', d.range.days === 30, `days=${d.range.days}`);
    check('kpis: funnel has 4 steps', Array.isArray(d.funnel) && d.funnel.length === 4,
      JSON.stringify(d.funnel.map((s) => `${s.key}=${s.count}`)));
    check('kpis: revenue counted from the successful payment only',
      d.totals.revenue === 5000, `revenue=${d.totals.revenue}`);
    check('kpis: payments count success only', d.totals.payments === 1, `payments=${d.totals.payments}`);
    check('kpis: documents counted', d.totals.documents >= 1, `documents=${d.totals.documents}`);
    check('kpis: engagement exposes dau/wau/mau',
      typeof d.engagement.dau === 'number' && typeof d.engagement.wau === 'number');

    // There is no revenue in the window before this one, so there is no percentage to
    // quote. A fabricated figure here would be the clearest way to make a dashboard
    // untrustworthy, and null is the honest answer.
    check('kpis: growth from a zero baseline is null, not a fake percentage',
      d.previousTotals.revenue === 0
        ? d.deltas.revenue === null
        : typeof d.deltas.revenue?.pct === 'number',
      `previous=${d.previousTotals.revenue} delta=${JSON.stringify(d.deltas.revenue)}`);
  }

  const clamped = await call(jar, 'GET', '/api/admin/kpis?days=99999', undefined, token(admin));
  check('kpis: crafted ?days is clamped', clamped.status === 200 && clamped.data.range.days === 365,
    `days=${clamped.data?.range?.days}`);

  // --- Health ----------------------------------------------------------------
  const healthAdmin = await call(jar, 'GET', '/api/admin/health', undefined, token(admin));
  check('GET /admin/health returns 200', healthAdmin.status === 200, `status ${healthAdmin.status}`);
  if (healthAdmin.status === 200) {
    const h = healthAdmin.data;
    check('health: mongo reported', typeof h.dependencies.mongo.ok === 'boolean');
    check('health: mongo actually reachable', h.dependencies.mongo.ok === true,
      JSON.stringify(h.dependencies.mongo));
    check('health: verdict derived', ['ok', 'degraded'].includes(h.status), h.status);
    check('health: scope is stated in the payload', typeof h.scope === 'string' && h.scope.length > 0, h.scope);
    check('health: routes bucketed and cardinality-bounded',
      Array.isArray(h.requests.routes) && h.requests.routes.length <= 200,
      `${h.requests.routes.length} routes`);

    // The full path, not the router-relative one. Seeing "/kpis" here would mean the
    // monitoring table names a route that does not exist.
    check('health: routes are absolute, not mount-relative',
      h.requests.routes.some((r) => r.path === '/api/admin/kpis'),
      JSON.stringify(h.requests.routes.map((r) => r.path)));
    check('health: the query string is not part of the route key',
      h.requests.routes.every((r) => !r.path.includes('?')));
    check('health: errors carry no request body',
      JSON.stringify(h.requests.recentErrors).length < 5000);
  }

  // --- non-admin is refused --------------------------------------------------
  const outsider = await call(jar, 'GET', '/api/admin/kpis', undefined, token(target));
  check('a normal user cannot read the KPIs', outsider.status === 403, `status ${outsider.status}`);
  const anon = await call(jar, 'GET', '/api/admin/kpis');
  check('an anonymous caller is refused', anon.status === 401, `status ${anon.status}`);

  // --- user 360 --------------------------------------------------------------
  const detail = await call(jar, 'GET', `/api/admin/users/${target._id}`, undefined, token(admin));
  check('GET /admin/users/:id returns 200', detail.status === 200, `status ${detail.status}`);
  if (detail.status === 200) {
    const d = detail.data;
    check('detail: never returns a credential',
      !('passwordHash' in d.user) && !('resetPasswordToken' in d.user)
      && !('emailVerificationCodeHash' in d.user));
    check('detail: cross-checks the stored document counter',
      typeof d.counts.counterMatchesStoredDocuments === 'boolean',
      `counter=${d.counts.documentsGeneratedCount} stored=${d.counts.documents}`);
    check('detail: payments split by status', typeof d.payments.byStatus === 'object');
    check('detail: activity labels its own coarseness',
      d.activity.lastLoginIsExact === true && d.activity.lastActiveIsThrottled === true);
  }

  // --- suspend ---------------------------------------------------------------
  // Signed first, so it stands in for the session the user is actually holding.
  // Signing it after the suspension would only exercise the second-resolution
  // boundary of the revocation check, not the case in question.
  const preSuspension = token(target);

  const susp = await call(jar, 'PATCH', `/api/admin/users/${target._id}/suspended`,
    { suspended: true, reason: 'abuse check #1' }, token(admin));
  check('suspend with a reason succeeds', susp.status === 200, `status ${susp.status} ${JSON.stringify(susp.data)}`);

  const noReason = await call(jar, 'PATCH', `/api/admin/users/${target._id}/suspended`,
    { suspended: true }, token(admin));
  check('a suspension with no reason is refused', noReason.status === 400, `status ${noReason.status}`);

  // Either refusal code is correct here. The suspension revokes sessions, so
  // 401 SESSION_REVOKED is a true statement about the token; 403 ACCOUNT_SUSPENDED
  // would be equally true of one issued afterwards. What must never happen is a 200,
  // or a bare error with no code for the client to key off.
  const targetLocked = await call(jar, 'GET', '/api/auth/me', undefined, preSuspension);
  check('a suspended account is refused on its own live token',
    [401, 403].includes(targetLocked.status)
      && ['SESSION_REVOKED', 'ACCOUNT_SUSPENDED'].includes(targetLocked.data?.code),
    `status ${targetLocked.status} code=${targetLocked.data?.code}`);

  const reinstate = await call(jar, 'PATCH', `/api/admin/users/${target._id}/suspended`,
    { suspended: false, reason: 'cleared' }, token(admin));
  check('reinstating succeeds', reinstate.status === 200, `status ${reinstate.status}`);
  check('reinstating clears the stale reason', reinstate.data?.suspendedReason === '',
    `reason=${JSON.stringify(reinstate.data?.suspendedReason)}`);

  // Reinstating must not revive a session revoked during the suspension: the reason
  // for the suspension may have been a compromised credential, and restoring that
  // token would undo the one thing the suspension did that the user cannot do
  // themselves. A fresh token is the way back in.
  //
  // Waits out the one-second window first. `iat` is whole seconds and floors down, so
  // a token minted in the same second as the revocation reads as issued before it and
  // is refused too. That is the direction this is meant to fail in — the alternative
  // lets a token issued moments before an admin acted survive them — and its cost is
  // one redundant login inside that second, which no human reaches because they still
  // have to reload and re-enter a password.
  await new Promise((resolve) => setTimeout(resolve, 1100));

  const targetBack = await call(jar, 'GET', '/api/auth/me', undefined, token(target));
  check('a reinstated account works again on a fresh session', targetBack.status === 200,
    `status ${targetBack.status} code=${targetBack.data?.code}`);

  const stillRevoked = await call(jar, 'GET', '/api/auth/me', undefined, preSuspension);
  check('reinstating does not revive the revoked session', stillRevoked.status === 401,
    `status ${stillRevoked.status} code=${stillRevoked.data?.code}`);

  // --- force logout ----------------------------------------------------------
  const preLogout = token(target);
  const logout = await call(jar, 'POST', `/api/admin/users/${target._id}/force-logout`, {}, token(admin));
  check('force logout succeeds', logout.status === 200, `status ${logout.status}`);

  const revoked = await call(jar, 'GET', '/api/auth/me', undefined, preLogout);
  check('the pre-existing session is revoked immediately, not at expiry',
    revoked.status === 401 && revoked.data?.code === 'SESSION_REVOKED',
    `status ${revoked.status} code=${revoked.data?.code}`);

  // --- credits / subscription ------------------------------------------------
  const credits = await call(jar, 'PATCH', `/api/admin/users/${target._id}/credits`,
    { delta: 4, reason: 'support comp' }, token(admin));
  check('a credit delta applies', credits.status === 200 && credits.data?.freeDocumentCredits === 5,
    `credits=${credits.data?.freeDocumentCredits}`);

  const clampedCredits = await call(jar, 'PATCH', `/api/admin/users/${target._id}/credits`,
    { delta: -100, reason: 'floor test' }, token(admin));
  check('credits cannot be driven negative', clampedCredits.data?.freeDocumentCredits === 0,
    `credits=${clampedCredits.data?.freeDocumentCredits}`);

  const sub = await call(jar, 'PATCH', `/api/admin/users/${target._id}/subscription`,
    { subscriptionStatus: 'active' }, token(admin));
  check('a hand-set subscription gets an expiry',
    sub.status === 200 && sub.data?.subscriptionStatus === 'active', `status ${sub.status}`);

  // --- password reset --------------------------------------------------------
  const reset = await call(jar, 'POST', `/api/admin/users/${target._id}/password-reset`, {}, token(admin));
  check('a reset link is issued', reset.status === 200 && !!reset.data?.resetUrl,
    `status=${reset.status}`);
  check('the reset response warns it is a credential', typeof reset.data?.warning === 'string');

  const afterReset = await call(jar, 'GET', '/api/auth/me', undefined, token(target));
  check('issuing a reset also ends live sessions',
    afterReset.status === 401 && afterReset.data?.code === 'SESSION_REVOKED',
    `status=${afterReset.status} code=${afterReset.data?.code}`);

  // --- self-action refusals --------------------------------------------------
  const selfSuspend = await call(jar, 'PATCH', `/api/admin/users/${admin._id}/suspended`,
    { suspended: true, reason: 'self test' }, token(admin));
  check('an admin cannot suspend themselves', selfSuspend.status === 400, `status ${selfSuspend.status}`);

  const selfErase = await call(jar, 'DELETE', `/api/admin/users/${admin._id}`, undefined, token(admin));
  check('an admin cannot erase themselves', selfErase.status === 400, `status ${selfErase.status}`);

  // --- audit -----------------------------------------------------------------
  const audit = await call(jar, 'GET', '/api/admin/audit', undefined, token(admin));
  check('GET /admin/audit returns 200', audit.status === 200, `status ${audit.status}`);
  if (audit.status === 200) {
    const actions = audit.data.entries.map((e) => e.action);
    check('audit recorded the suspension', actions.includes('user.suspend'), JSON.stringify(actions));
    check('audit recorded the force logout', actions.includes('user.force_logout'));
    check('audit recorded the credential reset', actions.includes('user.password_reset'));
    check('audit names both admin and target', audit.data.entries.every((e) => e.adminEmail && e.targetEmail));

    const missingReason = audit.data.entries.find((e) => e.action === 'user.password_reset');
    check('audit stores what was asked for and what followed',
      missingReason && missingReason.after && typeof missingReason.after === 'object');
  }

  // --- erasure ---------------------------------------------------------------
  const victim = await User.create({
    email: 'victim@check.test', name: 'Victim', passwordHash: 'x', emailVerified: true
  });
  await Payment.create({
    userId: victim._id, amount: 900, currency: 'XAF', type: 'one-time',
    status: 'success', phoneNumber: '+237611111111', provider: 'mtn'
  });

  const erase = await call(jar, 'DELETE', `/api/admin/users/${victim._id}`, undefined, token(admin));
  check('erasure succeeds', erase.status === 200, `status ${erase.status} ${JSON.stringify(erase.data)}`);

  const survivor = await User.findById(victim._id);
  check('erasure keeps the payment rows',
    await Payment.countDocuments({ userId: victim._id }) === 1);
  check('erasure scrubs the identity', survivor && !survivor.email.includes('victim@check.test'),
    `email=${survivor?.email}`);
  check('an erased account cannot sign in', survivor?.suspended === true);
  check('erasure removes admin rights', survivor?.role === 'user');

  // --- activity --------------------------------------------------------------
  const seen = await User.findById(admin._id);
  check('the admin guard stamps lastActiveAt too', Boolean(seen.lastActiveAt),
    `lastActiveAt=${seen.lastActiveAt}`);

  // --- the admin guard honours session state ---------------------------------
  // `requireAdmin` used to verify the JWT itself, so none of the guards in
  // requireAuth reached admin routes. This is the case where that mattered most:
  // force-logging-out an admin did nothing until the token simply expired.
  const adminLive = token(admin);

  const adminMe = await call(jar, 'GET', '/api/admin/kpis', undefined, adminLive);
  check('the admin session works before revocation', adminMe.status === 200,
    `status ${adminMe.status}`);

  const adminLogout = await call(jar, 'POST', `/api/admin/users/${admin._id}/force-logout`, {},
    adminLive);
  check('force logout can be applied to an admin', adminLogout.status === 200,
    `status ${adminLogout.status} ${JSON.stringify(adminLogout.data)}`);

  const adminRevoked = await call(jar, 'GET', '/api/admin/kpis', undefined, adminLive);
  check('an admin session is revoked on admin routes, not only on /auth/me',
    adminRevoked.status === 401 && adminRevoked.data?.code === 'SESSION_REVOKED',
    `status ${adminRevoked.status} code=${adminRevoked.data?.code}`);

  await mongoose.disconnect();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log('\nFAILURES:');
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('verification script failed:', err);
  process.exit(1);
});