const crypto = require('crypto');
const User = require('../models/User');
const TailoredDocument = require('../models/TailoredDocument');
const CV = require('../models/CV');
const Draft = require('../models/Draft');
const Payment = require('../models/Payment');
const Referral = require('../models/Referral');
const Application = require('../models/Application');
const Notification = require('../models/Notification');
const ApiKey = require('../models/ApiKey');
const PushSubscription = require('../models/PushSubscription');
const AdminAudit = require('../models/AdminAudit');
const logger = require('../utils/logger');
const { USER_PRIVATE_FIELDS } = require('./adminController');
const { parsePaging, listResponse } = require('../utils/paging');

/**
 * Admin user management: the 360 view, and the actions that change an account.
 *
 * Three rules apply to every mutation in this file:
 *
 * 1. An admin cannot act destructively on themselves. Every destructive action is a
 *    single click in a table row, and "suspend the account I am currently using" is
 *    the realistic accident, not an exotic one.
 *
 * 2. Every mutation writes an audit entry, in the same request, recording what the
 *    admin asked for and what the database then held. An admin action that leaves no
 *    trail is indistinguishable from a bug the user hit.
 *
 * 3. Nothing here returns a credential. The one endpoint that mints a token
 *    (`requestPasswordReset`) returns a link the admin must transmit out of band,
 *    and says so, rather than pretending it is a routine read.
 */

const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000;

/** Append-only audit entry. Never throws into the request path. */
async function recordAudit({ req, action, target, before, after, reason = '' }) {
  try {
    await AdminAudit.create({
      action,
      adminId: req.user._id,
      adminEmail: req.user.email,
      targetUserId: target._id,
      targetEmail: target.email,
      reason,
      before,
      after
    });
  } catch (err) {
    // The action has already been applied by the time this runs, so failing the
    // request here would report a change that did happen as a failed one. The gap is
    // logged loudly instead -- an unaudited admin action is an incident either way.
    logger.error(`AUDIT WRITE FAILED for ${action} on ${target.email}: ${err.message}`);
  }
}

/** Refuses self-targeting for actions that would end the admin's own access. */
function refuseSelf(req, target, what) {
  if (target._id.toString() === req.user._id.toString()) {
    return { error: `You cannot ${what} your own account.` };
  }
  return null;
}

/**
 * The per-user view an admin needs to answer "what is going on with this account".
 *
 * Assembled from several collections rather than a single denormalised document,
 * because that is the only way to answer the questions without duplicating state. The
 * counts are cheap; the lists are bounded and paged.
 */
exports.getUserDetail = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePaging(req.query);

    const user = await User.findById(req.params.id).select(USER_PRIVATE_FIELDS);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Flat, not nested. `Promise.all` resolves to a flat array, so a nested pattern
    // like `[a, b, [c, d]]` reads element 2 and tries to iterate it as an array —
    // which for a mongoose Query is a TypeError at request time rather than a
    // compile error, and the endpoint answers 500 to every call.
    const [
      documentCount,
      cvCount,
      paymentStats,
      applicationCount,
      referral,
      referredCount,
      documents,
      cvs,
      payments,
      audit
    ] = await Promise.all([
      TailoredDocument.countDocuments({ userId: user._id }),
      CV.countDocuments({ userId: user._id }),
      Payment.aggregate([
        { $match: { userId: user._id } },
        { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$amount' } } }
      ]),
      Application.countDocuments({ userId: user._id }),
      // The referral link lives on Referral, not on User: an account that never
      // referred anyone has no referral row at all, so counting rows is the only way
      // to tell "referred nobody" from "referred but lost".
      Referral.findOne({ referrerUserId: user._id }).sort({ createdAt: -1 }).lean(),
      Referral.countDocuments({ referrerUserId: user._id, referredUserId: { $ne: null } }),
      TailoredDocument.find({ userId: user._id }).sort({ createdAt: -1 }).skip(skip).limit(limit)
        .select('jobTitle jobDescription createdAt language').lean(),
      CV.find({ userId: user._id }).sort({ createdAt: -1 }).skip(skip).limit(limit)
        .select('name jobTitle createdAt').lean(),
      Payment.find({ userId: user._id }).sort({ createdAt: -1 }).skip(skip).limit(limit)
        .select('amount currency status provider type createdAt').lean(),
      AdminAudit.find({ targetUserId: user._id }).sort({ createdAt: -1 }).limit(25).lean()
    ]);

    const paymentsByStatus = paymentStats.reduce((acc, s) => {
      acc[s._id] = { count: s.count, total: s.total };
      return acc;
    }, {});

    res.json({
      user,
      activity: {
        // lastLoginAt is exact; lastActiveAt is throttled. Both are labelled so a
        // reader does not treat the coarse one as a session log.
        lastLoginAt: user.lastLoginAt || null,
        lastActiveAt: user.lastActiveAt || null,
        lastLoginIsExact: true,
        lastActiveIsThrottled: true
      },
      counts: {
        documents: documentCount,
        cvs: cvCount,
        applications: applicationCount,
        referredUsers: referredCount,
        // Null rather than 0 when the user never shared a code, so the UI can say
        // "never referred" instead of implying a code exists with no signups.
        referralCode: referral ? referral.code : null,
        // Cross-checked against the stored counter. When these disagree, the counter
        // drifted from reality and the difference is worth seeing.
        documentsGeneratedCount: user.documentsGeneratedCount || 0,
        counterMatchesStoredDocuments: (user.documentsGeneratedCount || 0) === documentCount
      },
      payments: {
        byStatus: paymentsByStatus,
        successful: paymentsByStatus.success || { count: 0, total: 0 },
        failed: paymentsByStatus.failed || { count: 0, total: 0 }
      },
      recent: { documents, cvs, payments },
      audit
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Suspend or reinstate an account.
 *
 * Suspension also revokes live sessions and the refresh token, so it takes effect
 * immediately rather than at the next login. Without that, suspending an abusive
 * account leaves the session they are already using working for up to 15 minutes,
 * which is usually the whole point of suspending someone.
 */
exports.setUserSuspended = async (req, res, next) => {
  try {
    const { suspended, reason = '' } = req.body;
    if (typeof suspended !== 'boolean') {
      return res.status(400).json({ error: 'suspended must be true or false' });
    }
    if (typeof reason !== 'string' || reason.length > 500) {
      return res.status(400).json({ error: 'reason must be text under 500 characters' });
    }
    // A suspension with no explanation is unreviewable: the user is locked out and the
    // only record of why is a log line nobody will read.
    if (suspended && !reason.trim()) {
      return res.status(400).json({ error: 'A suspension needs a reason. It is shown to the user.' });
    }

    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });

    const before = {
      suspended: target.suspended,
      suspendedReason: target.suspendedReason,
      suspendedAt: target.suspendedAt
    };

    if (suspended) {
      const selfRefusal = refuseSelf(req, target, 'suspend');
      if (selfRefusal) return res.status(400).json(selfRefusal);

      if (target.role === 'admin') {
        const otherAdmins = await User.countDocuments({
          role: 'admin',
          suspended: { $ne: true },
          _id: { $ne: target._id }
        });
        // Suspending an admin is allowed -- there are legitimate reasons -- but not
        // when it would leave no admin able to lift it.
        if (otherAdmins === 0) {
          return res.status(409).json({
            error: 'This is the only active admin account. Promote or reinstate another admin first.'
          });
        }
      }

      Object.assign(target, {
        suspended: true,
        suspendedAt: new Date(),
        suspendedReason: reason.trim(),
        suspendedBy: req.user._id,
        // Revokes the session in hand now, not just the next login.
        sessionInvalidBefore: new Date(),
        tokenVersion: (target.tokenVersion || 0) + 1
      });
    } else {
      Object.assign(target, {
        suspended: false,
        // Cleared rather than left, so a reinstated account can never display a stale
        // reason from a previous suspension.
        suspendedAt: null,
        suspendedReason: '',
        suspendedBy: null
      });
    }

    await target.save();

    await recordAudit({
      req,
      action: suspended ? 'user.suspend' : 'user.reinstate',
      target,
      before,
      after: {
        suspended: target.suspended,
        suspendedReason: target.suspendedReason,
        suspendedAt: target.suspendedAt
      },
      reason: reason.trim()
    });

    logger.info(`Admin ${req.user.email} ${suspended ? 'suspended' : 'reinstated'} ${target.email}`);
    res.json(target);
  } catch (err) {
    next(err);
  }
};

/**
 * End every live session for a user without touching the account.
 *
 * Both levers are pulled. `sessionInvalidBefore` kills the access token already in
 * the browser, and `tokenVersion` kills the refresh token that would otherwise mint a
 * replacement. Doing only the second -- which is all the previous code had -- leaves
 * the user working until the access token expires.
 */
exports.forceLogout = async (req, res, next) => {
  try {
    const target = await User.findById(req.params.id).select('_id email tokenVersion sessionInvalidBefore');
    if (!target) return res.status(404).json({ error: 'User not found' });

    const before = { tokenVersion: target.tokenVersion || 0, sessionInvalidBefore: target.sessionInvalidBefore || null };

    target.sessionInvalidBefore = new Date();
    target.tokenVersion = (target.tokenVersion || 0) + 1;
    await target.save();

    await recordAudit({
      req,
      action: 'user.force_logout',
      target,
      before,
      after: { tokenVersion: target.tokenVersion, sessionInvalidBefore: target.sessionInvalidBefore }
    });

    res.json({
      ok: true,
      userId: target._id,
      // Said plainly so the UI does not imply an immediate effect it cannot have: a
      // request already in flight completes, and any cached page stays open.
      message: 'All sessions ended. The user must log in again on their next request.'
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Mint a password reset link for a user who cannot self-serve.
 *
 * Returns the link to the admin rather than emailing it. That is a deliberate
 * difference from the user-facing flow: an admin resetting a password for someone
 * whose address is dead is usually doing it over the phone, and mail that does not
 * arrive is the problem being worked around.
 *
 * The consequence is that the link is a credential and this response must be treated
 * as one. It is not written to any log, and `USER_PRIVATE_FIELDS` keeps the stored
 * hash out of every other admin response.
 */
exports.requestPasswordReset = async (req, res, next) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });

    const token = crypto.randomBytes(32).toString('hex');
    const before = { hasResetToken: Boolean(target.resetPasswordToken) };

    target.resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');
    target.resetPasswordExpires = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);
    // Any existing session is invalidated alongside, so a reset taken out because the
    // account may be compromised does not leave the attacker's session alive.
    target.sessionInvalidBefore = new Date();
    target.tokenVersion = (target.tokenVersion || 0) + 1;
    await target.save();

    await recordAudit({
      req,
      action: 'user.password_reset',
      target,
      before,
      after: { resetTokenIssued: true, sessionInvalidBefore: target.sessionInvalidBefore }
    });

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    res.json({
      ok: true,
      resetUrl: `${baseUrl}/reset-password?token=${token}`,
      expiresInMinutes: RESET_TOKEN_EXPIRY_MS / 60000,
      // Not decoration: this is the credential, and whoever reads this response is
      // holding it.
      warning: 'This link is a credential. Send it to the user over a channel you trust; it is not emailed.'
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Adjust document credits by a delta.
 *
 * A delta rather than an absolute value, because the admin is looking at a number
 * and wants to give two more, not to restate a total they may have read wrong.
 */
exports.adjustCredits = async (req, res, next) => {
  try {
    const { delta, reason = '' } = req.body;
    const amount = Number(delta);

    // Not `if (!delta)`, which would reject 0 -- and "no change" is a legitimate
    // thing to submit when an admin opened the form by mistake.
    if (!Number.isInteger(amount)) {
      return res.status(400).json({ error: 'delta must be a whole number' });
    }
    if (amount === 0) {
      return res.status(400).json({ error: 'delta must not be zero' });
    }
    if (typeof reason !== 'string' || reason.length > 500) {
      return res.status(400).json({ error: 'reason must be text under 500 characters' });
    }

    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });

    const before = { freeDocumentCredits: target.freeDocumentCredits || 0 };

    // Non-negative. A negative credit balance is not a thing the product has any way
    // to display or resolve, and clamping here is what stops the admin UI producing
    // one by accident.
    target.freeDocumentCredits = Math.max(0, (target.freeDocumentCredits || 0) + amount);
    await target.save();

    await recordAudit({
      req,
      action: 'user.credits_changed',
      target,
      before,
      after: { freeDocumentCredits: target.freeDocumentCredits },
      reason: reason.trim()
    });

    res.json({ ok: true, freeDocumentCredits: target.freeDocumentCredits, applied: amount });
  } catch (err) {
    next(err);
  }
};

/** Set subscription status by hand, for support and comp cases. */
exports.setSubscription = async (req, res, next) => {
  try {
    const { subscriptionStatus, reason = '' } = req.body;
    if (!['none', 'active', 'expired'].includes(subscriptionStatus)) {
      return res.status(400).json({ error: 'Invalid subscription status' });
    }

    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });

    const before = {
      subscriptionStatus: target.subscriptionStatus,
      subscriptionExpiresAt: target.subscriptionExpiresAt || null
    };

    target.subscriptionStatus = subscriptionStatus;
    // Set only when it was requested. Clearing it for a hand-set "active" would make
    // the subscription look expired to whatever sweep reads this field, and the manual
    // grant would quietly stop granting.
    target.subscriptionExpiresAt = subscriptionStatus === 'active'
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      : null;
    await target.save();

    await recordAudit({
      req,
      action: 'user.subscription_changed',
      target,
      before,
      after: {
        subscriptionStatus: target.subscriptionStatus,
        subscriptionExpiresAt: target.subscriptionExpiresAt
      },
      reason: typeof reason === 'string' ? reason.trim() : ''
    });

    res.json({ ok: true, subscriptionStatus: target.subscriptionStatus });
  } catch (err) {
    next(err);
  }
};

/**
 * Erase a user's personal data while keeping the financial record.
 *
 * The default for a deletion request, and the only one offered. A hard delete would
 * remove the payment rows that produced the revenue figures on the overview, which
 * makes the audit trail and the ledger disagree -- so instead the account is
 * anonymised: the identity goes, the money stays.
 *
 * One row, updated, rather than a delete plus an insert: `User.email` is unique and
 * indexed, and dropping then reinserting would briefly free the address for someone
 * else to register.
 */
exports.anonymiseUser = async (req, res, next) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });

    const selfRefusal = refuseSelf(req, target, 'anonymise');
    if (selfRefusal) return res.status(400).json(selfRefusal);

    const originalEmail = target.email;
    const before = { email: originalEmail, name: target.name };

    // The pseudonym keeps the audit trail joinable -- the row is still the same
    // document -- while being useless for identifying anyone. The counter is in the
    // id so two users erased in the same millisecond cannot collide.
    const pseudonym = `deleted-user-${target._id}`;

    await Promise.all([
      TailoredDocument.deleteMany({ userId: target._id }),
      CV.deleteMany({ userId: target._id }),
      Draft.deleteMany({ userId: target._id }),
      Application.deleteMany({ userId: target._id }),
      Notification.deleteMany({ userId: target._id }),
      ApiKey.deleteMany({ userId: target._id }),
      PushSubscription.deleteMany({ userId: target._id })
    ]);

    // Payments are deliberately left alone, and the account is demoted rather than
    // removed: the user document is what the payment rows and the audit trail point
    // at, and removing it would orphan both.
    target.email = `${pseudonym}@anonymised.invalid`;
    target.name = 'Deleted user';
    target.avatar = '';
    target.bio = '';
    target.summary = '';
    target.phone = '';
    target.location = '';
    target.linkedin = '';
    target.website = '';
    target.googleId = null;
    target.facebookId = null;
    target.linkedinId = null;
    target.dailyDigest = false;
    target.role = 'user';
    // Left suspended: an erased identity must not be able to log back in.
    target.suspended = true;
    target.suspendedReason = 'Account erased on request';
    target.suspendedAt = new Date();
    target.sessionInvalidBefore = new Date();
    target.tokenVersion = (target.tokenVersion || 0) + 1;
    target.resetPasswordToken = undefined;
    target.resetPasswordExpires = undefined;
    target.emailVerificationToken = undefined;
    target.emailVerificationExpires = undefined;
    target.emailVerificationCodeHash = null;
    await target.save();

    await recordAudit({
      req,
      action: 'user.deleted',
      target,
      before,
      after: { email: target.email, suspended: true },
      reason: 'Erased on request; payments retained for the ledger'
    });

    logger.info(`Admin ${req.user.email} anonymised ${originalEmail}`);
    res.json({
      ok: true,
      message: `Erased ${originalEmail}. Payment records were kept for the ledger.`
    });
  } catch (err) {
    next(err);
  }
};

/** The admin accountability view: who did what, newest first. */
exports.listAudit = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePaging(req.query);
    const query = {};
    if (req.query.userId) query.targetUserId = req.query.userId;

    const [entries, total] = await Promise.all([
      AdminAudit.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AdminAudit.countDocuments(query)
    ]);

    res.json(listResponse({ items: entries, total, page, limit, key: 'entries' }));
  } catch (err) {
    next(err);
  }
};