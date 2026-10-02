const User = require('../models/User');
const TailoredDocument = require('../models/TailoredDocument');
const CV = require('../models/CV');
const Payment = require('../models/Payment');
const Job = require('../models/Job');
const Contact = require('../models/Contact');
const logger = require('../utils/logger');
const redis = require('../config/redis');
const { parsePaging, listResponse } = require('../utils/paging');
const workflow = require('../services/contactWorkflow');

/**
 * Fields never returned for another user, however the query was built.
 *
 * `.select()` calls naming the exclusions they want are the recurring source of
 * credential leaks here: a list endpoint that excludes `resetPasswordToken` reads
 * as careful while still shipping `passwordHash`. A new secret added to the User
 * schema would be returned by default again, so the deny-list below is applied on
 * every path that touches users and is asserted in tests.
 *
 * `passwordHash` is the one that matters — it is the credential store. A bcrypt
 * hash leaving the process is not a disclosure anyone can undo by changing a
 * password later in the incident.
 */
const USER_PRIVATE_FIELDS = '-passwordHash -resetPasswordToken -resetPasswordExpires '
  + '-emailVerificationToken -emailVerificationExpires';

exports.USER_PRIVATE_FIELDS = USER_PRIVATE_FIELDS;

exports.getDashboard = async (req, res, next) => {
  try {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      activeSubscriptions,
      totalDocuments,
      totalCVs,
      recentUsers,
      recentPayments,
      activeJobs,
      expiredJobs,
      unverifiedUsers,
      // Revenue is aggregated in the database rather than summed in JS: reading
      // every payment to total it would load an unbounded number of documents to
      // produce three numbers. Only `success` counts — a pending payment is money
      // that has not arrived, and treating it as income is the kind of number that
      // looks fine right up until it is audited.
      revenueAllTime,
      revenueThisMonth,
      successfulPayments,
      failedPayments,
      openContacts
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ subscriptionStatus: 'active' }),
      TailoredDocument.countDocuments(),
      CV.countDocuments(),
      User.find().sort({ createdAt: -1 }).limit(10)
        .select('email name subscriptionStatus emailVerified role createdAt'),
      Payment.find().sort({ createdAt: -1 }).limit(10)
        .select('userId amount currency status provider paymentMethod createdAt'),
      Job.countDocuments({ active: true }),
      // Surfaced so the expiry sweep is observable: a runaway or misconfigured
      // JOB_EXPIRY_DAYS shows up here instead of silently emptying the board.
      Job.countDocuments({ active: false }),
      // Email verification is enforced before the dashboard, so an account stuck
      // unverified is a support case. Counting them here is what turns "someone
      // says they cannot log in" into a number.
      User.countDocuments({ emailVerified: false }),
      Payment.aggregate([
        { $match: { status: 'success' } },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        }
      ]),
      Payment.aggregate([
        { $match: { status: 'success', createdAt: { $gte: monthStart } } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
      ]),
      Payment.countDocuments({ status: 'success' }),
      Payment.countDocuments({ status: 'failed' }),
      // Only the working states, so the badge matches what an admin can act on
      // rather than counting messages already answered.
      Contact.countDocuments({ status: { $in: workflow.OPEN_STATUSES } })
    ]);

    const allTime = revenueAllTime[0] || { total: 0, count: 0 };
    const month = revenueThisMonth[0] || { total: 0, count: 0 };

    res.json({
      stats: {
        totalUsers,
        activeSubscriptions,
        totalDocuments,
        totalCVs,
        freeUsers: totalUsers - activeSubscriptions,
        activeJobs,
        expiredJobs,
        unverifiedUsers,
        openContacts
      },
      revenue: {
        // Left unrounded: this is a raw sum in the smallest currency unit, and
        // rounding it for display in a place that also feeds decisions invites
        // drift between what the dashboard says and what the ledger says.
        allTime: allTime.total,
        allTimeCount: allTime.count,
        thisMonth: month.total,
        thisMonthCount: month.count,
        successfulPayments,
        failedPayments,
        // Null rather than 0 when nothing has sold yet, so the UI can show "—"
        // instead of claiming an average order value of zero.
        averageOrderValue: allTime.count > 0
          ? Math.round(allTime.total / allTime.count)
          : null
      },
      // What the app itself thinks of its own dependencies. Surfaced because the
      // alternative is curling /api/health, which is exactly what this dashboard
      // should save an operator from doing.
      system: {
        cache: redis.isReady() ? 'redis' : 'memory',
        redis: redis.isConfigured() ? redis.status() : { ok: false, state: 'not-configured' }
      },
      recentUsers,
      recentPayments
    });
  } catch (err) {
    next(err);
  }
};

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

exports.listUsers = async (req, res, next) => {
  try {
    const { search = '', role, verified, subscription, sort } = req.query;
    const { page, limit, skip } = parsePaging(req.query);

    const query = {};

    if (search) {
      // Anchored nowhere and case-insensitive, so a substring matches. A leading
      // `.*` is implied rather than written: on a non-indexed field MongoDB
      // still scans, but the regex is cheaper and stays inside the regex cache
      // rather than defeating it.
      const rx = new RegExp(escapeRegex(search.trim()), 'i');
      query.$or = [{ email: rx }, { name: rx }];
    }

    // Filters are validated against the schema enums before they reach the query.
    // An unknown value is ignored rather than passed through: `{ role: 'admin; ' }
    // would otherwise be a query for a role nobody has, returning an empty page
    // that reads as "no such user" instead of "your filter was invalid".
    if (role === 'user' || role === 'admin') query.role = role;

    // `verified=0`/`false` means unverified; `1`/`true` means verified; anything
    // else leaves the field unfiltered.
    if (verified === 'true' || verified === '1') query.emailVerified = true;
    else if (verified === 'false' || verified === '0') query.emailVerified = false;

    if (['none', 'active', 'expired'].includes(subscription)) {
      query.subscriptionStatus = subscription;
    }

    // Newest-first is the default and the only sort exposed. Sorting by email or
    // role means a full in-memory sort of the whole collection, which on an
    // unindexed field is a collection scan plus a sort stage — acceptable for a
    // page of results, not for the whole user base.
    const sortSpec = sort === 'oldest' ? { createdAt: 1 } : { createdAt: -1 };

    const [users, total] = await Promise.all([
      User.find(query)
        .sort(sortSpec)
        .skip(skip)
        .limit(limit)
        // USER_PRIVATE_FIELDS, not a hand-written exclusion list: see its comment.
        .select(USER_PRIVATE_FIELDS),
      User.countDocuments(query)
    ]);

    res.json(listResponse({ items: users, total, page, limit, key: 'users' }));
  } catch (err) {
    next(err);
  }
};

/**
 * Block a change that would leave the service with no admin.
 *
 * Demoting the last admin is unrecoverable through the product: `requireAdmin`
 * gates every route in this file, so with no admins there is no UI path back and
 * the only fix is a database edit. This runs before the update rather than after,
 * because the count has to be of the *pre-change* state.
 *
 * Uses `countDocuments` for the size and `findOne` for the existence check
 * separately, deliberately: a count with `_id: { $ne: ... }` is one query, but
 * when the answer is "one admin, and it is not this one" the count has to agree
 * with a real document before anything is written.
 */
async function wouldRemoveLastAdmin(userId) {
  const admins = await User.countDocuments({ role: 'admin' });
  if (admins <= 1) {
    const otherAdmin = await User.findOne({ role: 'admin', _id: { $ne: userId } })
      .select('_id')
      .lean();
    return !otherAdmin;
  }
  return false;
}

exports.updateUserRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const target = await User.findById(req.params.id).select('_id role email');
    if (!target) return res.status(404).json({ error: 'User not found' });

    // Self-demotion is refused even when another admin exists. It is a
    // single-click action in the UI with no confirmation, so the realistic
    // outcome is an admin demoting themselves by accident and locking themselves
    // out of the page they are looking at.
    if (target._id.toString() === req.user._id.toString() && role !== 'admin') {
      return res.status(400).json({
        error: 'You cannot demote your own account. Ask another admin to do it.'
      });
    }

    if (target.role === 'admin' && role === 'user') {
      if (await wouldRemoveLastAdmin(target._id)) {
        return res.status(409).json({
          error: 'This is the only admin account. Promote another user first.'
        });
      }
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true }
    ).select(USER_PRIVATE_FIELDS);

    // The target existed a moment ago and the role was validated, so a null here
    // means the document was deleted mid-request. A 404 is the honest answer;
    // falling through would return null as a 200 body.
    if (!user) return res.status(404).json({ error: 'User not found' });

    logger.info(`Admin ${req.user.email} changed ${user.email} role from ${target.role} to ${role}`);
    res.json(user);
  } catch (err) {
    next(err);
  }
};

/**
 * Update a user's email verification state by hand.
 *
 * Exists because verification is enforced: an address that cannot receive mail
 * (a typo, a dead domain, a mail server that started rejecting us) locks the
 * account out of everything, and there is no in-product path for an admin to fix
 * that. Deliberately does not send anything — marking verified without proof is
 * an admin decision, recorded in the log.
 */
exports.setUserVerified = async (req, res, next) => {
  try {
    const { emailVerified } = req.body;
    if (typeof emailVerified !== 'boolean') {
      return res.status(400).json({ error: 'emailVerified must be true or false' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        emailVerified,
        // Clearing the token as well, so a later verification attempt cannot
        // resurrect a link that was already used or explicitly revoked here.
        ...(emailVerified
          ? { emailVerificationToken: null, emailVerificationExpires: null }
          : {})
      },
      { new: true }
    ).select(USER_PRIVATE_FIELDS);

    if (!user) return res.status(404).json({ error: 'User not found' });

    logger.info(
      `Admin ${req.user.email} marked ${user.email} as `
      + `${emailVerified ? 'verified' : 'unverified'}`
    );
    res.json(user);
  } catch (err) {
    next(err);
  }
};

exports.listPayments = async (req, res, next) => {
  try {
    const { status } = req.query;
    const { page, limit, skip } = parsePaging(req.query);

    const query = {};
    // Validated against the Payment enum, for the same reason as the user
    // filters: an unknown status must not look like "no payments matched".
    if (['pending', 'success', 'failed', 'expired'].includes(status)) {
      query.status = status;
    }

    const [payments, total] = await Promise.all([
      Payment.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'email name'),
      Payment.countDocuments(query)
    ]);

    // Totals for the current filter, not the whole table: a total that ignores
    // the filter you are looking at is the number you will quote from.
    const totals = await Payment.aggregate([
      ...(Object.keys(query).length ? [{ $match: query }] : []),
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          total: { $sum: '$amount' }
        }
      }
    ]);

    const byStatus = totals.reduce((acc, t) => {
      acc[t._id] = { count: t.count, total: t.total };
      return acc;
    }, {});

    res.json({
      ...listResponse({ items: payments, total, page, limit, key: 'payments' }),
      totals: {
        byStatus,
        // Success only. A pending payment is money that has not arrived.
        successful: byStatus.success || { count: 0, total: 0 },
        failed: byStatus.failed || { count: 0, total: 0 }
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Contact inbox.
 *
 * Sorts unread-first within the filter so the default view is the work, and
 * returns the per-status counts that drive the tab badges. The counts are
 * computed over the *search* filter but not the status filter, since a badge
 * reading "0 new" while new messages are hidden by the status filter is
 * confusing rather than helpful.
 */
exports.listContacts = async (req, res, next) => {
  try {
    const { status, search = '' } = req.query;
    const { page, limit, skip } = parsePaging(req.query);

    const query = {};

    if (search) {
      const rx = new RegExp(escapeRegex(search.trim()), 'i');
      query.$or = [{ name: rx }, { email: rx }, { subject: rx }, { message: rx }];
    }

    const statusFilter = workflow.STATUSES.includes(status) ? status : null;

    const countQuery = { ...query };
    if (statusFilter) countQuery.status = statusFilter;

    // Newest first within a status, but unread ahead of read: `new` sorts before
    // `read` via the ordinal, so a plain sort by (status, createdAt) puts the
    // queue in front of the archive without a second pass in JS.
    const messages = await Contact.find(countQuery)
      .sort({ status: 1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'email name')
      .populate('statusChangedBy', 'email')
      .lean();

    const [total, grouped] = await Promise.all([
      Contact.countDocuments(countQuery),
      Contact.aggregate([
        { $match: query },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ])
    ]);

    const counts = workflow.STATUSES.reduce((acc, s) => {
      acc[s] = 0;
      return acc;
    }, {});
    for (const g of grouped) counts[g._id] = g.count;

    res.json({
      ...listResponse({ items: messages, total, page, limit, key: 'messages' }),
      counts,
      // Sums the two working states, which is what the tab badge shows.
      open: counts.new + counts.read,
      statusFilter: statusFilter || 'all'
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Move a contact message through the workflow.
 *
 * The transition is validated by `services/contactWorkflow`, which is the only
 * place the rules live. A rejected transition is a 409, not a 400: the request
 * is well-formed, it conflicts with the current state.
 */
exports.updateContactStatus = async (req, res, next) => {
  try {
    const { status, reply, clearReply } = req.body;

    // Checked here rather than left to the schema, because `findByIdAndUpdate`
    // does not run validators by default — a 50k-character reply would be written
    // and only surface as a cast error on some later read. A non-string `reply`
    // is the same problem: mongoose would try to cast an object into a String
    // field and fail inside the update.
    if (reply !== undefined && typeof reply !== 'string') {
      return res.status(400).json({ error: 'reply must be text' });
    }
    if (typeof reply === 'string' && reply.length > 5000) {
      return res.status(400).json({ error: 'reply must be under 5000 characters' });
    }

    const contact = await Contact.findById(req.params.id);
    if (!contact) return res.status(404).json({ error: 'Message not found' });

    const reason = workflow.transitionError(contact.status, status);
    if (reason) {
      return res.status(409).json({
        error: reason,
        currentStatus: contact.status,
        allowed: workflow.allowedFrom(contact.status)
      });
    }

    // No-op: return the message untouched rather than writing a new
    // `statusChangedAt` for a change that did not happen, which would make the
    // audit fields lie about when the message was last touched.
    if (contact.status === status && !reply && !clearReply) {
      return res.json(contact);
    }

    const update = workflow.buildStatusUpdate({
      from: contact.status,
      to: status,
      reply,
      clearReply: Boolean(clearReply),
      actor: req.user
    });

    const updated = await Contact.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true }
    )
      .populate('userId', 'email name')
      .populate('statusChangedBy', 'email');

    if (!updated) return res.status(404).json({ error: 'Message not found' });

    logger.info(
      `Admin ${req.user.email} moved contact message ${updated._id} `
      + `${contact.status} -> ${updated.status}`
    );

    res.json(updated);
  } catch (err) {
    next(err);
  }
};
