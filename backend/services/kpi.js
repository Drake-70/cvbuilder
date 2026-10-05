const User = require('../models/User');
const TailoredDocument = require('../models/TailoredDocument');
const Payment = require('../models/Payment');

/**
 * Admin KPI aggregation.
 *
 * Everything here is aggregated in the database and returns counts, never documents.
 * A dashboard that loads rows to total them has a ceiling that arrives without
 * warning: it is fine at a thousand users and falls over at a hundred thousand, in
 * production, on the page an admin opens when something is already wrong.
 *
 * Days are bucketed in UTC, not in the viewer's timezone. Deliberate: a timezone
 * applied per-request makes the same chart show different numbers to two admins
 * looking at it at the same time, and turns any comparison against a figure that was
 * worked out by hand into an argument. UTC is stated in the response so the UI can
 * label it.
 *
 * Currency is not converted. The app bills in one currency today; a sum across
 * currencies added later would need an exchange rate and an as-of date, and silently
 * adding unlike amounts is the kind of number that is only wrong once.
 */

const DEFAULT_DAYS = 30;
const MAX_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Clamped so a crafted `?days=99999` cannot ask for a multi-year scan. */
function resolveRange(query = {}) {
  const raw = Number.parseInt(query.days, 10);
  const days = Number.isFinite(raw) && raw > 0 ? Math.min(raw, MAX_DAYS) : DEFAULT_DAYS;

  // Anchored to the start of the current UTC day, so "today" is a partial bucket
  // rather than a day that looks complete and is not.
  const to = new Date();
  to.setUTCHours(0, 0, 0, 0);
  to.setUTCDate(to.getUTCDate() + 1);
  const from = new Date(to.getTime() - days * DAY_MS);

  return { days, from, to, previousFrom: new Date(from.getTime() - days * DAY_MS) };
}

/** The `days` day labels, oldest first, used to left-join the sparse aggregations. */
function dayLabels(from, days) {
  const labels = [];
  for (let i = 0; i < days; i += 1) {
    labels.push(new Date(from.getTime() + i * DAY_MS).toISOString().slice(0, 10));
  }
  return labels;
}

/**
 * Counts per UTC day for one collection, keyed by the same labels `dayLabels` emits.
 *
 * `$dateToString` with an explicit `timezone: 'UTC'` rather than relying on the
 * default, because the default is the server's zone and a container's zone is not a
 * contract.
 */
async function countByDay(model, from, to, extraMatch = {}) {
  const rows = await model.aggregate([
    { $match: { createdAt: { $gte: from, $lt: to }, ...extraMatch } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } },
        count: { $sum: 1 }
      }
    }
  ]);

  const out = {};
  for (const row of rows) out[row._id] = row.count;
  return out;
}

/** Revenue per UTC day. Successful payments only, for the same reason the overview is. */
async function revenueByDay(from, to) {
  const rows = await Payment.aggregate([
    { $match: { status: 'success', createdAt: { $gte: from, $lt: to } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } },
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);

  const out = {};
  for (const row of rows) out[row._id] = { total: row.total, count: row.count };
  return out;
}

/**
 * The activation funnel for the cohort that registered inside the window.
 *
 * Every step is measured against the *same* cohort, which is what makes it a funnel
 * rather than four unrelated totals. Each step is a conditional sum in a single
 * `$group`, so this is one pass over the window with no `$lookup` and no round trip
 * per step.
 *
 * `documentsGeneratedCount > 0` stands in for "generated a document". It is read from
 * the user rather than counted from TailoredDocument on purpose: it avoids joining
 * every user in the window to their documents, and it is the same counter the product
 * already uses for its own "documents generated" figure, so the funnel cannot
 * disagree with it. A user whose documents were all deleted still counts here, which
 * is the right answer for "did this cohort ever activate".
 */
async function activationFunnel(from, to) {
  const [row] = await User.aggregate([
    { $match: { createdAt: { $gte: from, $lt: to } } },
    {
      $group: {
        _id: null,
        registered: { $sum: 1 },
        verified: { $sum: { $cond: ['$emailVerified', 1, 0] } },
        generated: {
          $sum: { $cond: [{ $gt: [{ $ifNull: ['$documentsGeneratedCount', 0] }, 0] }, 1, 0] }
        },
        subscribed: {
          $sum: { $cond: [{ $eq: [{ $ifNull: ['$subscriptionStatus', 'none'] }, 'active'] }, 1, 0] }
        }
      }
    }
  ]);

  const base = row || { registered: 0, verified: 0, generated: 0, subscribed: 0 };

  const steps = [
    { key: 'registered', label: 'Registered' },
    { key: 'verified', label: 'Verified email' },
    { key: 'generated', label: 'Generated a document' },
    { key: 'subscribed', label: 'Started a subscription' }
  ];

  return steps.map((step, index) => ({
    ...step,
    count: base[step.key],
    // Rate is against the first step, not the previous one. A step-to-step rate reads
    // better as a shape but hides the drop-off at the first step, which is the one
    // that decides whether the funnel is healthy.
    conversion: base.registered > 0 ? Number((base[step.key] / base.registered).toFixed(4)) : null,
    // Null rather than zero when there is no cohort: a funnel with no signups has no
    // conversion rate, and reporting 0% for it is a claim about the product.
    stepConversion: index === 0 || base[steps[index - 1].key] === 0
      ? null
      : Number((base[step.key] / base[steps[index - 1].key]).toFixed(4))
  }));
}

/**
 * Active users, as a point in time rather than a history.
 *
 * `lastActiveAt` is a single timestamp per user, throttled to one write per user per
 * five minutes (see `services/activity`). That is enough to answer "how many users
 * were around recently" and not enough to reconstruct how many were around on a given
 * day last month. So these are counts over trailing windows, computed now, and are
 * deliberately not charted as a daily series -- drawing that line would imply a
 * history that was never recorded.
 */
async function engagement(now = new Date()) {
  const dayAgo = new Date(now.getTime() - DAY_MS);
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const monthAgo = new Date(now.getTime() - 30 * DAY_MS);

  const [dau, wau, mau, total] = await Promise.all([
    User.countDocuments({ lastActiveAt: { $gte: dayAgo } }),
    User.countDocuments({ lastActiveAt: { $gte: weekAgo } }),
    User.countDocuments({ lastActiveAt: { $gte: monthAgo } }),
    User.countDocuments({})
  ]);

  return {
    dau,
    wau,
    mau,
    totalUsers: total,
    // Stickiness: the share of monthly actives that showed up today. The standard
    // engagement health number, and it needs no history to compute.
    dauMauRatio: mau > 0 ? Number((dau / mau).toFixed(4)) : null,
    // Null until a user has been active at all, so a brand-new deployment does not
    // claim a 0% stickiness rate that looks like a product failure.
    coverage: total > 0 ? Number((mau / total).toFixed(4)) : null
  };
}

/**
 * Percentage change between two numbers.
 *
 * Returns null when the previous value is zero, because growth from nothing has no
 * meaningful percentage -- it is infinite, and rendering it as a number is worse than
 * rendering nothing. Also returns null when the current value is zero, since a drop
 * to zero is a real number worth showing as "went to zero" rather than "-100%" from a
 * baseline that was never there.
 */
function delta(current, previous) {
  if (previous === 0 || previous == null || current == null) return null;
  return {
    current,
    previous,
    change: current - previous,
    pct: Number((((current - previous) / previous) * 100).toFixed(1))
  };
}

/** Scalars for the window and the equally long window before it. */
async function windowTotals(from, to) {
  const [signups, documents, revenueAgg, revenuePrevAgg, verified] = await Promise.all([
    User.countDocuments({ createdAt: { $gte: from, $lt: to } }),
    TailoredDocument.countDocuments({ createdAt: { $gte: from, $lt: to } }),
    Payment.aggregate([
      { $match: { status: 'success', createdAt: { $gte: from, $lt: to } } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]),
    Payment.aggregate([
      {
        $match: {
          status: 'success',
          createdAt: { $gte: new Date(from.getTime() - (to - from)), $lt: from }
        }
      },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]),
    User.countDocuments({ createdAt: { $gte: from, $lt: to }, emailVerified: true })
  ]);

  return {
    signups,
    documents,
    verifiedSignups: verified,
    revenue: revenueAgg[0] ? revenueAgg[0].total : 0,
    payments: revenueAgg[0] ? revenueAgg[0].count : 0,
    previousRevenue: revenuePrevAgg[0] ? revenuePrevAgg[0].total : 0,
    previousPayments: revenuePrevAgg[0] ? revenuePrevAgg[0].count : 0
  };
}

/**
 * Everything the KPI tab needs, in one response.
 *
 * One endpoint rather than six so the page cannot render half-populated: the numbers
 * on a dashboard are read together, and six fetches means a slow one is a chart that
 * silently disagrees with the tiles beside it.
 */
async function kpiSummary(query = {}) {
  const { days, from, to, previousFrom } = resolveRange(query);
  const labels = dayLabels(from, days);

  const [signupsByDay, documentsByDay, revenueDaily, funnel, engagementNow, totals, previous] =
    await Promise.all([
      countByDay(User, from, to),
      countByDay(TailoredDocument, from, to),
      revenueByDay(from, to),
      activationFunnel(from, to),
      engagement(),
      windowTotals(from, to),
      windowTotals(previousFrom, from)
    ]);

  // Left-joined against the full label list, so a day with no activity plots as zero
  // rather than being absent. A gap and a zero look the same on a line chart, and
  // only one of them is true.
  const series = {
    labels,
    signups: labels.map((d) => signupsByDay[d] || 0),
    documents: labels.map((d) => documentsByDay[d] || 0),
    revenue: labels.map((d) => (revenueDaily[d] ? revenueDaily[d].total : 0)),
    payments: labels.map((d) => (revenueDaily[d] ? revenueDaily[d].count : 0))
  };

  const totalsPrevious = {
    signups: previous.signups,
    documents: previous.documents,
    revenue: previous.previousRevenue,
    payments: previous.previousPayments
  };

  return {
    range: {
      days,
      from: from.toISOString(),
      to: to.toISOString(),
      // Surfaced so the UI can label the chart instead of implying local time.
      timezone: 'UTC',
      // The current day is only partly elapsed, which matters when comparing a
      // half-finished today against complete days.
      partialCurrentDay: true
    },
    series,
    totals: {
      signups: totals.signups,
      documents: totals.documents,
      revenue: totals.revenue,
      payments: totals.payments,
      verifiedSignups: totals.verifiedSignups
    },
    deltas: {
      signups: delta(totals.signups, totalsPrevious.signups),
      documents: delta(totals.documents, totalsPrevious.documents),
      revenue: delta(totals.revenue, totalsPrevious.revenue),
      payments: delta(totals.payments, totalsPrevious.payments)
    },
    funnel,
    engagement: engagementNow,
    previousTotals: totalsPrevious
  };
}

module.exports = {
  kpiSummary,
  resolveRange,
  dayLabels,
  delta,
  activationFunnel,
  engagement,
  DEFAULT_DAYS,
  MAX_DAYS
};