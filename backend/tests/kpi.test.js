const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const kpi = require('../services/kpi');

const ROOT = path.join(__dirname, '..', '..');
const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const DAY = 24 * 60 * 60 * 1000;

// The range resolver is the only part of this service that can be talked into
// scanning the whole collection, so it is the part that has to be checked directly.
test('the requested window is clamped rather than honoured', () => {
  assert.strictEqual(kpi.resolveRange({}).days, kpi.DEFAULT_DAYS);
  assert.strictEqual(kpi.resolveRange({ days: '7' }).days, 7);

  // A crafted ?days=99999 must not become a multi-year collection scan.
  assert.strictEqual(kpi.resolveRange({ days: '99999' }).days, kpi.MAX_DAYS);

  // Nonsense falls back to the default rather than defaulting to zero or to NaN,
  // which would produce an empty chart and look like a quiet week.
  for (const bad of ['0', '-5', 'abc', '', null, undefined, {}]) {
    assert.strictEqual(
      kpi.resolveRange({ days: bad }).days,
      kpi.DEFAULT_DAYS,
      `days=${JSON.stringify(bad)} should fall back to the default`
    );
  }
});

test('the window ends at the start of tomorrow, so today is included', () => {
  const { from, to, days } = kpi.resolveRange({ days: '30' });

  assert.strictEqual(to.getTime() - from.getTime(), days * DAY);

  // Exclusive end at tomorrow 00:00 UTC: "today" is inside the window, and the
  // exclusive bound is what stops a payment made in the next millisecond from being
  // counted against this range.
  const todayUtc = new Date().toISOString().slice(0, 10);
  assert.strictEqual(to.toISOString().slice(0, 10), new Date(Date.now() + DAY).toISOString().slice(0, 10));
  assert.ok(new Date(`${todayUtc}T00:00:00.000Z`) < to, 'today must fall inside the window');
});

test('day labels are contiguous, oldest first, and end on today', () => {
  const { from, days } = kpi.resolveRange({ days: '30' });
  const labels = kpi.dayLabels(from, days);

  assert.strictEqual(labels.length, days);

  // Contiguity is the property the charts rely on: a missing or repeated label makes
  // a gap in a line chart that reads as "no activity" when it is really "no data".
  for (let i = 1; i < labels.length; i += 1) {
    const previous = new Date(`${labels[i - 1]}T00:00:00.000Z`).getTime();
    const current = new Date(`${labels[i]}T00:00:00.000Z`).getTime();
    assert.strictEqual(current - previous, DAY, `${labels[i - 1]} -> ${labels[i]} must be one day`);
  }

  assert.strictEqual(labels[labels.length - 1], new Date().toISOString().slice(0, 10));
});

// Growth from nothing has no percentage. Rendering one is how a dashboard ends up
// showing "∞%" or, worse, a fabricated 100%.
test('a percentage change is refused when there is no baseline', () => {
  assert.strictEqual(kpi.delta(50, 0), null);
  assert.strictEqual(kpi.delta(0, 0), null);
  assert.strictEqual(kpi.delta(50, null), null);
  assert.strictEqual(kpi.delta(null, 10), null);
});

test('a percentage change is computed when there is a baseline', () => {
  const up = kpi.delta(150, 100);
  assert.deepStrictEqual(up, { current: 150, previous: 100, change: 50, pct: 50 });

  const down = kpi.delta(25, 100);
  assert.deepStrictEqual(down, { current: 25, previous: 100, change: -75, pct: -75 });

  // Unchanged is reported as 0%, not suppressed: "flat" is information.
  assert.strictEqual(kpi.delta(40, 40).pct, 0);
});

test('the funnel is one grouped pass, not one query per step', () => {
  const service = src('backend/services/kpi.js');

  // Four sequential counts would be four collection scans over the window, and they
  // could disagree with each other if a signup landed between them.
  const funnelBody = service.slice(service.indexOf('async function activationFunnel'), service.indexOf('async function engagement'));

  assert.ok(funnelBody.includes('$group'), 'the funnel must aggregate');
  assert.ok(!funnelBody.includes('$lookup'), 'the funnel must not join to documents');
  assert.strictEqual(
    (funnelBody.match(/User\.aggregate/g) || []).length,
    1,
    'the funnel must be a single aggregation'
  );

  // Every step reads from the one grouped result rather than issuing its own count.
  for (const key of ['verified', 'generated', 'subscribed']) {
    assert.ok(funnelBody.includes(`base[step.key]`), 'steps must read the grouped row');
    assert.ok(funnelBody.includes(key), `step ${key} must be present`);
  }
});

test('the funnel measures every step against the cohort, not the previous step', () => {
  const service = src('backend/services/kpi.js');

  // Step-to-step conversion is kept, but the headline `conversion` is against the
  // first step: a funnel whose drop-off at signup is invisible is a funnel that can
  // look healthy while the top of it is collapsing.
  assert.ok(service.includes('base.registered > 0 ? Number((base[step.key] / base.registered)'));
  assert.ok(service.includes('stepConversion'), 'step-to-step is still reported, separately');
});

test('a funnel with no cohort reports null conversion rather than 0%', () => {
  // Zero signups means there is no cohort, so "0% converted" is a claim about the
  // product rather than an absence of data.
  const service = src('backend/services/kpi.js');
  assert.ok(service.includes('base.registered > 0 ? Number('));
  assert.ok(service.includes('? null'), 'no cohort must yield null, not 0');
});

test('the activation step reads the stored counter, and says why', () => {
  const service = src('backend/services/kpi.js');

  // documentsGeneratedCount is what the product itself uses for "documents
  // generated", so the funnel cannot drift from the headline figure.
  assert.ok(service.includes('$ifNull: [\'$documentsGeneratedCount\', 0]'));
  assert.ok(service.includes('$gt:'), 'must be a > 0 comparison, not an existence check');

  // Null-safe: an account with no counter value must count as zero, not make the
  // whole $cond fail to match.
  assert.ok(service.includes('$ifNull: [\'$subscriptionStatus\', \'none\']'));
});

test('day bucketing is pinned to UTC and not left to the server zone', () => {
  const service = src('backend/services/kpi.js');

  // Relying on the default means a container's TZ silently changes the buckets, and
  // the same chart shows different numbers on two machines.
  const groupings = service.match(/\$dateToString[^}]*}/g) || [];
  assert.ok(groupings.length >= 1, 'must bucket by day');
  for (const g of groupings) {
    assert.ok(g.includes("timezone: 'UTC'"), `every $dateToString must pin UTC, got: ${g}`);
  }
});

test('only successful payments count toward revenue', () => {
  const service = src('backend/services/kpi.js');

  // Same rule as the overview: a pending payment is money that has not arrived, and
  // counting it makes revenue a number that is wrong in the optimistic direction.
  const paymentMatches = service.match(/status: 'success'/g) || [];
  assert.ok(paymentMatches.length >= 2, 'both the series and the totals must filter on success');
});

test('the previous period is the same length as the window', () => {
  const { from, to, previousFrom } = kpi.resolveRange({ days: '30' });

  // Comparing 30 days against 60 would show growth that is only an artefact of the
  // comparison window.
  assert.strictEqual(to.getTime() - previousFrom.getTime(), 2 * 30 * DAY);
  assert.strictEqual(from.getTime() - previousFrom.getTime(), 30 * DAY);
});

test('the engagement figures are labelled as a point in time, not a history', () => {
  const service = src('backend/services/kpi.js');

  // lastActiveAt is a single throttled timestamp. Reconstructing daily history from
  // it is impossible, so the payload must not invite that reading.
  assert.ok(service.includes('lastActiveAt: { $gte: dayAgo }'), 'DAU is a trailing-window count');
  assert.ok(service.includes('lastActiveAt: { $gte: weekAgo }'));
  assert.ok(service.includes('lastActiveAt: { $gte: monthAgo }'));
  assert.ok(service.includes('point in time'), 'the scope must be stated where it is computed');
});