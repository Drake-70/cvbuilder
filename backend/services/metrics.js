/**
 * In-process request metrics.
 *
 * What this is for: the admin monitoring tab answers "is the app healthy right now,
 * and which endpoint is hurting". That is a question about live traffic, and the
 * answers are cheap to keep in memory.
 *
 * What this deliberately is not: durable history. These numbers reset on every
 * deploy and restart, and are per-instance -- with more than one instance each one
 * only sees its own share. For anything that has to survive a deploy or be summed
 * across instances, this is the wrong tool and a metrics backend is the right one.
 * The alternative, writing every request to Mongo, would put a write on the hot path
 * to produce a chart; this keeps the request path allocation-only.
 *
 * Latency is summarised with a fixed-bucket histogram rather than storing samples.
 * Storing samples means an unbounded array whose percentile has to be computed by
 * sorting it, and the sort cost grows with the very traffic you are trying to measure.
 * Buckets give a fixed, bounded read and are accurate to within the bucket width,
 * which is the right trade for "is this endpoint slow".
 */

// Upper bounds in milliseconds. A request slower than the last bucket lands there,
// so the histogram stays fixed-size and the slowest requests are still visible --
// clamped, never dropped.
const LATENCY_BUCKETS_MS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

// Recent errors are kept for the monitoring tab to display. Bounded because this is
// an unbounded-error-rate module and the first thing that goes wrong under load is
// the thing that fills memory.
const MAX_RECENT_ERRORS = 50;

const MAX_TRACKED_ROUTES = 200;

/** How often the histogram is reset, so long-lived processes stay current. */
const WINDOW_MS = 15 * 60 * 1000;

function emptyLatency() {
  return { buckets: new Array(LATENCY_BUCKETS_MS.length).fill(0), overflow: 0, sum: 0, count: 0 };
}

function emptyRoute() {
  return { requests: 0, errors: 0, statusClasses: {}, latency: emptyLatency(), firstSeen: Date.now(), lastSeen: Date.now() };
}

/**
 * Request shape: overall counters, per-normalised-route counters, a latency
 * histogram per route, recent errors, and the process start time used for uptime.
 */
const state = {
  startedAt: Date.now(),
  totals: { requests: 0, errors: 0, inFlight: 0 },
  routes: new Map(),
  recentErrors: [],
  windowStartedAt: Date.now()
};

/**
 * Collapse a path to a low-cardinality key.
 *
 * `/api/documents/66f0c1.../share` becomes `/api/documents/:id/share`. Without this,
 * every document id in the app is its own time series: the map grows without bound,
 * the monitoring page shows a thousand one-request routes instead of the twelve that
 * matter, and an attacker can exhaust memory by hitting invented ids.
 *
 * The hex threshold is 24 characters, not "anything hex-looking", because 24 is the
 * length of a Mongo ObjectId and therefore the only id shape this app actually puts
 * in a path. A shorter threshold looks harmless and is not: at 8, a legitimate route
 * segment such as `deadbeef` or a referral code is silently rewritten to `:id`, and the
 * monitoring tab then reports a route that does not exist while the real one is
 * missing. Guessing more broadly than the ids actually in use trades a cardinality risk
 * for a correctness one, and correctness is the one a human reads.
 *
 * Purely numeric segments are collapsed at any length, since no route in this app is
 * named as a bare number.
 */
function normaliseRoute(pathname, routePattern) {
  if (routePattern) return routePattern;
  return String(pathname || '')
    .split('/')
    .map((segment) => (/^[0-9a-fA-F]{24,}$/.test(segment) || /^\d+$/.test(segment) ? ':id' : segment))
    .join('/') || '/';
}

function bucketFor(ms) {
  for (let i = 0; i < LATENCY_BUCKETS_MS.length; i += 1) {
    if (ms <= LATENCY_BUCKETS_MS[i]) return i;
  }
  return LATENCY_BUCKETS_MS.length; // one past the end, i.e. the overflow slot
}

function recordLatency(histogram, ms) {
  const slot = bucketFor(ms);
  if (slot < LATENCY_BUCKETS_MS.length) histogram.buckets[slot] += 1;
  else histogram.overflow += 1;
  histogram.sum += ms;
  histogram.count += 1;
}

/** Express middleware. Mounted early so it measures the whole request lifecycle. */
function metricsMiddleware(req, res, next) {
  const startedAt = process.hrtime.bigint();

  // Captured here rather than read back at `finish`. By then Express has handed the
  // request to a mounted router, and `req.route.path` is relative to that mount --
  // "/kpis" instead of "/api/admin/kpis". Two routers with the same sub-path would
  // then collide into one key, and the monitoring table would name a route that does
  // not exist while the real one never appears. `originalUrl` is the full path; the
  // query string is stripped because a query is unbounded, so leaving it in would
  // rely entirely on the cardinality cap to avoid one key per request.
  const requestPath = String(req.originalUrl || req.url || req.path || '').split('?')[0] || '/';

  state.totals.requests += 1;
  state.totals.inFlight += 1;

  let settled = false;
  const finish = () => {
    // `finish` and `close` can both fire, and a client that disconnects mid-response
    // fires only `close`. Guarded so a request is counted exactly once.
    if (settled) return;
    settled = true;
    state.totals.inFlight -= 1;

    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const status = res.statusCode;
    const isError = status >= 500;
    const key = normaliseRoute(requestPath);

    let route = state.routes.get(key);
    if (!route) {
      // Past the cap the map is cleared rather than grown: the monitoring tab shows
      // the busiest routes, and under a cardinality flood the busiest are exactly
      // what is worth keeping.
      if (state.routes.size >= MAX_TRACKED_ROUTES) state.routes.clear();
      route = emptyRoute();
      state.routes.set(key, route);
    }

    route.requests += 1;
    route.lastSeen = Date.now();
    const statusClass = `${Math.floor(status / 100)}xx`;
    route.statusClasses[statusClass] = (route.statusClasses[statusClass] || 0) + 1;
    if (isError) route.errors += 1;
    recordLatency(route.latency, durationMs);

    if (isError) {
      if (state.recentErrors.length >= MAX_RECENT_ERRORS) state.recentErrors.shift();
      state.recentErrors.push({
        at: new Date().toISOString(),
        method: req.method,
        path: key,
        status,
        durationMs: Math.round(durationMs),
        // The message only, never the request body or headers: an error page that
        // echoes a request is how tokens and passwords end up in a log someone can
        // read from the admin panel.
        message: (res.locals && res.locals.errorMessage) || 'server error'
      });
    }

    maybeRollWindow();
  };

  res.on('finish', finish);
  res.on('close', finish);
  next();
}

/** Reset the rolling window once it is stale, so long-lived processes stay current. */
function maybeRollWindow() {
  if (Date.now() - state.windowStartedAt < WINDOW_MS) return;
  state.windowStartedAt = Date.now();
  state.totals.requests = 0;
  state.totals.errors = 0;
  for (const route of state.routes.values()) {
    route.requests = 0;
    route.errors = 0;
    route.statusClasses = {};
    route.latency = emptyLatency();
  }
}

/** Percentile from the histogram. Linear interpolation inside the containing bucket. */
function percentileFrom(histogram, fraction) {
  const total = histogram.count;
  if (total === 0) return null;

  const target = total * fraction;
  let cumulative = 0;
  for (let i = 0; i < histogram.buckets.length; i += 1) {
    const next = cumulative + histogram.buckets[i];
    if (next >= target) {
      const lower = i === 0 ? 0 : LATENCY_BUCKETS_MS[i - 1];
      const upper = LATENCY_BUCKETS_MS[i];
      const withinBucket = histogram.buckets[i] === 0 ? 0 : (target - cumulative) / histogram.buckets[i];
      return Math.round(lower + (upper - lower) * withinBucket);
    }
    cumulative = next;
  }

  // Past the last bucket: the slowest requests. Reported as the lower bound rather
  // than dropped, so p99 of a failing endpoint cannot read as fast.
  const overflowTotal = histogram.overflow;
  if (overflowTotal === 0) return LATENCY_BUCKETS_MS[LATENCY_BUCKETS_MS.length - 1];
  const lower = LATENCY_BUCKETS_MS[LATENCY_BUCKETS_MS.length - 1];
  return Math.round(lower * (1 + (target - cumulative) / Math.max(1, overflowTotal)));
}

function summariseRoute([key, route]) {
  return {
    path: key,
    requests: route.requests,
    errors: route.errors,
    errorRate: route.requests > 0 ? Number((route.errors / route.requests).toFixed(4)) : 0,
    statusClasses: route.statusClasses,
    p50: percentileFrom(route.latency, 0.5),
    p95: percentileFrom(route.latency, 0.95),
    p99: percentileFrom(route.latency, 0.99),
    averageMs: route.latency.count > 0 ? Math.round(route.latency.sum / route.latency.count) : null
  };
}

/** A snapshot for the monitoring tab. */
function snapshot() {
  maybeRollWindow();

  const routes = [...state.routes.entries()].map(summariseRoute);
  const allLatency = routes.reduce((acc, r) => ({ count: acc.count + r.requests, sum: acc.sum + (r.averageMs || 0) * r.requests }), { count: 0, sum: 0 });
  const windowRequests = routes.reduce((acc, r) => acc + r.requests, 0);
  const windowErrors = routes.reduce((acc, r) => acc + r.errors, 0);

  return {
    uptimeSeconds: Math.round((Date.now() - state.startedAt) / 1000),
    windowSeconds: Math.round(WINDOW_MS / 1000),
    windowStartedAt: new Date(state.windowStartedAt).toISOString(),
    memory: process.memoryUsage(),
    totals: {
      requests: windowRequests,
      errors: windowErrors,
      inFlight: state.totals.inFlight,
      errorRate: windowRequests > 0 ? Number((windowErrors / windowRequests).toFixed(4)) : 0,
      averageMs: allLatency.count > 0 ? Math.round(allLatency.sum / allLatency.count) : null
    },
    // Slowest first, so the monitoring tab does not have to sort to be useful.
    routes: routes.sort((a, b) => (b.p99 || 0) - (a.p99 || 0)),
    recentErrors: state.recentErrors.slice(-MAX_RECENT_ERRORS).reverse(),
    // Stated in the payload as well as in the UI, because a number without its scope
    // is the kind of thing that gets quoted as "our error rate" months later.
    scope: 'per-process, resets on deploy'
  };
}

/** Test seam. */
function reset() {
  state.startedAt = Date.now();
  state.windowStartedAt = Date.now();
  state.totals = { requests: 0, errors: 0, inFlight: 0 };
  state.routes.clear();
  state.recentErrors.length = 0;
}

module.exports = { metricsMiddleware, snapshot, normaliseRoute, percentileFrom, reset, LATENCY_BUCKETS_MS };