const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const requireAuthSrc = src('backend/middleware/requireAuth.js');
const activity = require('../services/activity');

let issuedBeforeRevocation;
let loaded = true;
try {
  ({ issuedBeforeRevocation } = require('../middleware/requireAuth'));
} catch {
  // Requiring the middleware pulls in the User model, which is fine without a live
  // connection. If that ever stops being true the source assertions below still run;
  // only the pure-function cases are skipped.
  loaded = false;
}

const usersCtrl = src('backend/controllers/adminUsersController.js');
const authController = src('backend/controllers/authController.js');
const adminRoutes = src('backend/routes/admin.js');

// --- session revocation -------------------------------------------------------

test('a token issued before the revocation instant is refused', { skip: !loaded }, () => {
  const user = { sessionInvalidBefore: new Date('2026-10-05T12:00:00.000Z') };

  // Issued at 11:59: the session that existed when the admin acted.
  assert.strictEqual(
    issuedBeforeRevocation({ iat: Math.floor(Date.parse('2026-10-05T11:59:00.000Z') / 1000) }, user),
    true
  );

  // Issued at 12:01: a login after the action, which must survive.
  assert.strictEqual(
    issuedBeforeRevocation({ iat: Math.floor(Date.parse('2026-10-05T12:01:00.000Z') / 1000) }, user),
    false
  );
});

test('an account with no revocation instant revokes nothing', { skip: !loaded }, () => {
  assert.strictEqual(issuedBeforeRevocation({ iat: 1000 }, { sessionInvalidBefore: null }), false);
  assert.strictEqual(issuedBeforeRevocation({ iat: 1000 }, {}), false);
});

test('a token with no issue time is not revoked', { skip: !loaded }, () => {
  // Fails open deliberately, and only for the one-second window this can affect:
  // refusing every token missing `iat` would lock out users whose tokens were minted
  // by a signer that omits it.
  assert.strictEqual(
    issuedBeforeRevocation({}, { sessionInvalidBefore: new Date() }),
    false
  );
});

test('revocation is compared by issue time, not by token version', () => {
  // Version rotation happens on every refresh, so using it here would reject the
  // access token a client is holding immediately after a normal refresh.
  assert.ok(requireAuthSrc.includes('sessionInvalidBefore'));
  assert.ok(requireAuthSrc.includes('decoded.iat'), 'must compare the token issue time');
  assert.ok(!requireAuthSrc.includes('decoded.tokenVersion'), 'must not compare token versions');
});

test('a revoked session is refused before anything else, with 401', () => {
  const revokedAt = requireAuthSrc.indexOf('SESSION_REVOKED');
  const suspendedAt = requireAuthSrc.indexOf('ACCOUNT_SUSPENDED');

  assert.ok(revokedAt > -1, 'must handle the revoked case');
  assert.ok(suspendedAt > -1, 'must handle the suspended case');
  // Order matters: a suspended user whose session was also revoked should be told the
  // session ended, because that is what the client has to act on.
  assert.ok(revokedAt < suspendedAt, 'revocation must be checked first');

  // 401 rather than 403 -- the credential is no longer valid, so the correct client
  // response is to log in again, not to display a permissions error.
  const revocationBlock = requireAuthSrc.slice(requireAuthSrc.indexOf('issuedBeforeRevocation(decoded'), revokedAt);
  assert.ok(revocationBlock.includes('401'), 'a revoked session is a 401');
});

test('suspension is refused before the verification gate', () => {
  const suspendedAt = requireAuthSrc.indexOf('ACCOUNT_SUSPENDED');
  const verifiedAt = requireAuthSrc.indexOf('enforceVerified(req, res)');

  assert.ok(suspendedAt < verifiedAt, 'suspension must be checked before verification');

  // A client that only knows how to handle "verify your email" would otherwise bounce
  // a suspended user to a page that cannot help them.
  const block = requireAuthSrc.slice(requireAuthSrc.indexOf('if (user.suspended)'), verifiedAt);
  assert.ok(block.includes('403'), 'a suspended account is a 403');
  assert.ok(block.includes('ACCOUNT_SUSPENDED'), 'the refusal must be identifiable by the client');
});

// --- login path ---------------------------------------------------------------

test('login refuses a suspended account only after the password is checked', () => {
  const passwordCheck = authController.indexOf('comparePassword(password)');
  const suspension = authController.indexOf('ACCOUNT_SUSPENDED');

  assert.ok(passwordCheck > -1 && suspension > passwordCheck,
    'suspension must be checked after the password comparison');

  // Before would make the form an account-existence oracle: "this account is
  // suspended" is an answer about an account, available to anyone who can name the
  // address.
  const loginBlock = authController.slice(passwordCheck, suspension);
  assert.ok(!loginBlock.includes('ACCOUNT_SUSPENDED'), 'no suspension answer before the password check');
});

test('login stamps lastLoginAt on the session path only', () => {
  assert.ok(authController.includes('user.lastLoginAt = new Date()'));
});

test('a suspended account is described to its owner, not silently dropped', () => {
  // The user needs to know why they are locked out and who to ask.
  assert.ok(authController.includes('suspended: !!user.suspended'));
  assert.ok(authController.includes('suspendedReason'));
});

// --- activity throttle --------------------------------------------------------

test('activity writes at most once per user per interval', () => {
  activity.resetThrottle();

  assert.strictEqual(activity.shouldWrite('user-1'), true, 'the first request writes');
  assert.strictEqual(activity.shouldWrite('user-1'), false, 'a burst after it does not');
  assert.strictEqual(activity.shouldWrite('user-1'), false);

  // Per user, not global: a busy account must not silence everyone else.
  assert.strictEqual(activity.shouldWrite('user-2'), true);
  assert.strictEqual(activity.shouldWrite('user-2'), false);
});

test('a missing user id never writes', () => {
  assert.strictEqual(activity.shouldWrite(null), false);
  assert.strictEqual(activity.shouldWrite(undefined), false);
  assert.strictEqual(activity.shouldWrite(''), false);
});

test('the throttle interval is long enough to be worth having', () => {
  // The whole point is that a page with a dozen calls collapses into one write.
  assert.ok(activity.THROTTLE_MS >= 60 * 1000,
    'a sub-minute throttle would barely reduce anything');
});

test('activity tracking is applied on the authenticated path, not in every controller', () => {
  assert.ok(requireAuthSrc.includes('activity.touch(user._id, User)'));

  // Doing it here rather than per-controller is what stops a new route from
  // forgetting to record activity.
  assert.ok(requireAuthSrc.indexOf('activity.touch') > requireAuthSrc.indexOf('enforceVerified(req, res)'),
    'the stamp must not run on a request that was already refused');

  // Fire-and-forget: it must never delay or fail a response.
  assert.ok(!requireAuthSrc.includes('await activity.touch'));
});

// --- suspension management ----------------------------------------------------

test('a suspension requires a reason, because it is shown to the user', () => {
  assert.ok(usersCtrl.includes('A suspension needs a reason'));

  const block = usersCtrl.slice(usersCtrl.indexOf('if (suspended && !reason.trim())'));
  assert.ok(block.includes('400'), 'an unexplained suspension is refused');
});

test('an admin cannot suspend or erase their own account', () => {
  // Both are one click away in a table row, and the realistic accident is the admin's
  // own account rather than an exotic one.
  assert.ok(usersCtrl.includes('refuseSelf'));
  assert.ok(usersCtrl.includes("refuseSelf(req, target, 'suspend')"));
  assert.ok(usersCtrl.includes("refuseSelf(req, target, 'anonymise')"));

  // The helper decides; the callers turn its answer into a response.
  const helper = usersCtrl.slice(
    usersCtrl.indexOf('function refuseSelf'),
    usersCtrl.indexOf('/**', usersCtrl.indexOf('function refuseSelf') + 10)
  );
  assert.ok(helper.includes('cannot'), 'the refusal must be explained, not just signalled');
  assert.strictEqual((usersCtrl.match(/res\.status\(400\)\.json\(selfRefusal\)/g) || []).length, 2,
    'both callers must answer a self-targeting attempt');
});

test('the last active admin cannot be suspended', () => {
  assert.ok(usersCtrl.includes('This is the only active admin account'));
  assert.ok(usersCtrl.includes('otherAdmins === 0'));
  assert.ok(usersCtrl.includes('409'), 'a conflict, not a validation error');
});

test('suspending also ends the live sessions', () => {
  const block = usersCtrl.slice(usersCtrl.indexOf('exports.setUserSuspended'), usersCtrl.indexOf('exports.forceLogout'));

  // Both levers, because neither alone is immediate: sessionInvalidBefore kills the
  // access token in hand, tokenVersion kills the refresh that would replace it.
  assert.ok(block.includes('sessionInvalidBefore'), 'must revoke the current session');
  assert.ok(block.includes('tokenVersion'), 'must revoke the refresh token');
});

test('reinstating clears the stale suspension state', () => {
  const block = usersCtrl.slice(usersCtrl.indexOf('} else {\n      Object.assign(target, {'), usersCtrl.indexOf('await target.save();'));

  // A reason left in place after reinstatement is shown to a user who is no longer
  // suspended, which is both wrong and a small disclosure about their own history.
  assert.ok(block.includes('suspendedReason: \'\''), 'the reason must be cleared');
  assert.ok(block.includes('suspendedAt: null'));
  assert.ok(block.includes('suspendedBy: null'));
});

// --- forced logout and reset --------------------------------------------------

test('a forced logout ends sessions rather than only refusing the next refresh', () => {
  const block = usersCtrl.slice(usersCtrl.indexOf('exports.forceLogout'), usersCtrl.indexOf('exports.requestPasswordReset'));

  assert.ok(block.includes('sessionInvalidBefore'));
  assert.ok(block.includes('tokenVersion'));
  // Said plainly rather than left for the UI to imply something stronger.
  assert.ok(block.includes('The user must log in again'));
});

test('an admin password reset returns a link and warns that it is a credential', () => {
  const block = usersCtrl.slice(usersCtrl.indexOf('exports.requestPasswordReset'), usersCtrl.indexOf('exports.adjustCredits'));

  assert.ok(block.includes('resetUrl'));
  // The token itself is never persisted in plaintext, matching the user-facing flow.
  assert.ok(block.includes("createHash('sha256')"));
  assert.ok(block.includes('This link is a credential'));

  // A reset taken out because the account may be compromised must not leave the
  // attacker's session alive.
  assert.ok(block.includes('sessionInvalidBefore'));
});

// --- credits and subscription -------------------------------------------------

test('a credit adjustment is a delta, is never zero, and cannot go negative', () => {
  const block = usersCtrl.slice(usersCtrl.indexOf('exports.adjustCredits'), usersCtrl.indexOf('exports.setSubscription'));

  // Not `if (!delta)`, which would reject 0 -- a legitimate submit of "no change".
  assert.ok(block.includes('Number.isInteger(amount)'));
  assert.ok(block.includes('delta must not be zero'));

  // A negative balance is not a thing the product can display or resolve.
  assert.ok(block.includes('Math.max(0,'));
});

test('a hand-set active subscription is given an expiry so the sweep does not undo it', () => {
  const block = usersCtrl.slice(usersCtrl.indexOf('exports.setSubscription'), usersCtrl.indexOf('exports.anonymiseUser'));

  // Clearing this for a manual grant would make the subscription look expired to
  // whatever reads the field, and the grant would quietly stop granting.
  assert.ok(block.includes('subscriptionStatus === \'active\''));
  assert.ok(block.includes('new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)'));
});

// --- erasure ------------------------------------------------------------------

test('erasing a user keeps their payments', () => {
  const block = usersCtrl.slice(usersCtrl.indexOf('exports.anonymiseUser'), usersCtrl.indexOf('exports.listAudit'));

  // The payment rows produce the revenue figures on the overview. Deleting them makes
  // the ledger and the audit trail disagree, which is worse than holding an anonymised
  // row.
  assert.ok(!block.includes('Payment.deleteMany'), 'payments must be retained');
  assert.ok(!block.includes('Payment.findOneAndDelete'));
  assert.ok(usersCtrl.includes('Payment records were kept for the ledger'));
});

test('erasing removes the personal data that actually identifies someone', () => {
  const block = usersCtrl.slice(usersCtrl.indexOf('exports.anonymiseUser'), usersCtrl.indexOf('exports.listAudit'));

  for (const field of ['target.email', 'target.name', 'target.avatar', 'target.phone',
    'target.location', 'target.linkedin', 'target.website', 'target.googleId']) {
    assert.ok(block.includes(field), `${field} must be cleared`);
  }

  // The pseudonym is derived from the id, so the audit trail stays joinable while the
  // identity is not recoverable.
  assert.ok(block.includes('anonymised.invalid'));
});

test('an erased identity cannot log back in', () => {
  const block = usersCtrl.slice(usersCtrl.indexOf('exports.anonymiseUser'), usersCtrl.indexOf('exports.listAudit'));

  assert.ok(block.includes('target.suspended = true'));
  assert.ok(block.includes('sessionInvalidBefore'));
  assert.ok(block.includes('target.tokenVersion'));
  assert.ok(block.includes('target.role = \'user\''), 'admin rights must not survive erasure');
});

// --- audit trail --------------------------------------------------------------

test('every mutation writes an audit entry', () => {
  const mutations = [
    'exports.setUserSuspended',
    'exports.forceLogout',
    'exports.requestPasswordReset',
    'exports.adjustCredits',
    'exports.setSubscription',
    'exports.anonymiseUser'
  ];

  for (const marker of mutations) {
    const start = usersCtrl.indexOf(marker);
    assert.ok(start > -1, `${marker} must exist`);
    const nextHandler = usersCtrl.indexOf('\nexports.', start + 10);
    const body = usersCtrl.slice(start, nextHandler > -1 ? nextHandler : usersCtrl.length);
    assert.ok(body.includes('recordAudit'), `${marker} must write an audit entry`);
  }
});

test('the audit trail records what was asked for and what the database then held', () => {
  // Only that pairing lets a later reader tell a deliberate change from one that
  // silently did not apply.
  assert.ok(usersCtrl.includes('recordAudit({'), 'calls pass before/after');

  const calls = usersCtrl.match(/recordAudit\(\{/g) || [];
  assert.ok(calls.length >= 6, 'every handler audits');
});

test('a failed audit write is logged loudly instead of failing the request', () => {
  // The change has already been applied by that point. Failing here would report a
  // change that did happen as a failed one.
  const helper = usersCtrl.slice(usersCtrl.indexOf('async function recordAudit'), usersCtrl.indexOf('/** Refuses self-targeting'));

  assert.ok(helper.includes('catch'), 'must not throw into the request path');
  assert.ok(helper.includes('AUDIT WRITE FAILED'));
});

test('the audit model cannot be edited through the API', () => {
  // Read-only by construction: there is no route that writes, updates or deletes an
  // entry, so the log cannot be edited through the API that relies on it.
  const mutating = adminRoutes.match(/\.(post|put|patch|delete)\([^)]*audit/gi) || [];
  assert.strictEqual(mutating.length, 0, 'no audit-mutating route may exist');
  assert.ok(adminRoutes.includes('router.get(\'/audit\''), 'the trail must be readable');
});

test('the audit trail can name its subject after the account is erased', () => {
  const model = src('backend/models/AdminAudit.js');

  // Anonymisation changes the email but keeps the document, so a trail holding only
  // the id would be unattributable -- which is the one case an audit log exists for.
  assert.ok(model.includes('targetEmail'));
  assert.ok(model.includes('adminEmail'));
});

test('admin actions come from a closed set', () => {
  const model = src('backend/models/AdminAudit.js');

  // Free text cannot be queried, so "show me every credential reset" would need
  // normalising by hand first.
  assert.ok(model.includes('enum:'), 'the action must be an enum');
  for (const action of ['user.suspend', 'user.reinstate', 'user.force_logout', 'user.password_reset']) {
    assert.ok(model.includes(action), `${action} must be recorded`);
  }
});

// --- route surface ------------------------------------------------------------

test('every admin route is behind the admin guard', () => {
  // `router.use` before any handler, so a route added later cannot be accidentally
  // public: it is covered by construction rather than by remembering.
  const guard = adminRoutes.indexOf('router.use(requireAdmin)');
  const firstRoute = adminRoutes.indexOf('router.get(');

  assert.ok(guard > -1, 'the guard must be applied');
  assert.ok(guard < firstRoute, 'the guard must come before every handler');
});

test('the new endpoints are wired to the handlers that were written for them', () => {
  const expected = [
    ['router.get(\'/kpis\'', 'adminKpiController.getKpis'],
    ['router.get(\'/health\'', 'adminKpiController.getHealth'],
    ['router.get(\'/users/:id\'', 'adminUsersController.getUserDetail'],
    ['router.patch(\'/users/:id/suspended\'', 'adminUsersController.setUserSuspended'],
    ['router.post(\'/users/:id/force-logout\'', 'adminUsersController.forceLogout'],
    ['router.post(\'/users/:id/password-reset\'', 'adminUsersController.requestPasswordReset'],
    ['router.patch(\'/users/:id/credits\'', 'adminUsersController.adjustCredits'],
    ['router.patch(\'/users/:id/subscription\'', 'adminUsersController.setSubscription'],
    ['router.delete(\'/users/:id\'', 'adminUsersController.anonymiseUser']
  ];

  for (const [route, handler] of expected) {
    assert.ok(adminRoutes.includes(route), `${route} must be routed`);
    assert.ok(adminRoutes.includes(handler), `${handler} must be wired`);
  }
});

test('the per-user view cannot return a credential', () => {
  // The deny-list is applied on every path that touches users, so a new secret on the
  // User schema is not returned by default again.
  assert.ok(usersCtrl.includes('USER_PRIVATE_FIELDS'));
  assert.ok(usersCtrl.includes('select(USER_PRIVATE_FIELDS)'));

  const controller = src('backend/controllers/adminController.js');
  assert.ok(controller.includes('-passwordHash'));
  assert.ok(controller.includes('-resetPasswordToken'));
  assert.ok(controller.includes('-emailVerificationCodeHash'));
});

test('the per-user view cross-checks the stored document counter', () => {
  // When the two disagree the counter has drifted, and the difference is worth seeing
  // rather than silently preferring one of them.
  assert.ok(usersCtrl.includes('counterMatchesStoredDocuments'));
});