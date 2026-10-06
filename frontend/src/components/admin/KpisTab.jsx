import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import api from '../../services/api';
import { Skeleton } from '../Skeleton';
import AdminStat from './AdminStat';
import { chartColors, tickInterval, TREND_METRICS } from './chartTheme';

/**
 * KPI dashboard: trends, activation funnel, and engagement.
 *
 * Three things this screen is careful about, each of which is a way a dashboard
 * usually ends up lying:
 *
 * 1. The comparison window is stated. Every percentage here is against the equally
 *    long window immediately before it, and the tiles name that period rather than
 *    showing a bare "+18%".
 * 2. Missing data is not rendered as zero. Growth from a zero baseline has no
 *    percentage, so the tile shows the absolute number and says there is no
 *    comparison, instead of inventing a figure.
 * 3. The active-user figures are trailing-window counts, not a history.
 *    `lastActiveAt` is one throttled timestamp per user, so a daily active-users
 *    line cannot be drawn and is not drawn. See `services/kpi` for why.
 */
const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' }
];

function formatMoney(amount, currency = 'XAF') {
  if (typeof amount !== 'number') return '\u2014';
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${currency}`;
}

function formatCount(value) {
  if (typeof value !== 'number') return '\u2014';
  return value.toLocaleString();
}

/** Short date for an axis tick: "6 Oct", or "6 Oct 25" across a year boundary. */
function shortDate(label, index, all) {
  const parsed = new Date(`${label}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return label;

  const day = parsed.getUTCDate();
  const month = parsed.toLocaleString('en', { month: 'short', timeZone: 'UTC' });

  // Only the first and last tick carry a year. A repeated year on every tick is noise,
  // and dropping it from every tick makes the endpoints ambiguous.
  const needsYear = index === 0 || index === all.length - 1;
  return needsYear ? `${day} ${month} ${String(parsed.getUTCFullYear()).slice(2)}` : `${day} ${month}`;
}

/**
 * A period-over-period change.
 *
 * Null is a real state here, not an error: it means the previous period had no
 * events, so there is no percentage to quote.
 */
function Delta({ delta, invert = false }) {
  if (!delta) {
    return <span className="text-[11px] text-surface-400">No prior period to compare</span>;
  }

  const positive = delta.pct > 0;
  const negative = delta.pct < 0;
  // Revenue going up is good; error rate going up is not. `invert` is the only place
  // that difference lives, so a caller adding a metric cannot get the colour wrong
  // by forgetting a second rule elsewhere.
  const good = invert ? negative : positive;
  const tone = delta.pct === 0
    ? 'text-surface-400'
    : good
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-rose-600 dark:text-rose-400';

  return (
    <span className={`text-[11px] font-medium tabular-nums ${tone}`}>
      {delta.pct > 0 ? '+' : ''}{delta.pct}%
      <span className="text-surface-400 font-normal"> vs previous</span>
    </span>
  );
}

function ChartTooltip({ active, payload, label, colors, format }) {
  if (!active || !payload?.length) return null;

  return (
    <div
      className="rounded-xl border px-3 py-2 shadow-lg text-xs"
      style={{ background: colors.tooltip.background, borderColor: colors.tooltip.border, color: colors.tooltip.text }}
    >
      <p className="font-medium mb-1">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} className="tabular-nums" style={{ color: entry.color }}>
          {format(entry.value)}
        </p>
      ))}
    </div>
  );
}

export default function KpisTab() {
  const { theme } = useTheme();
  const { toast } = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const colors = useMemo(() => chartColors(theme), [theme]);

  const [days, setDays] = useState(30);
  const [metric, setMetric] = useState('signups');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    api.get('/admin/kpis', { params: { days } })
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch((err) => {
        if (!cancelled) {
          toastRef.current.error('Could not load KPIs', err.response?.data?.error || 'Please try again.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [days]);

  const active = TREND_METRICS.find((m) => m.key === metric) || TREND_METRICS[0];

  const rows = useMemo(() => {
    if (!data) return [];
    return data.series.labels.map((label, index) => ({
      label,
      tick: shortDate(label, index, data.series.labels),
      signups: data.series.signups[index],
      documents: data.series.documents[index],
      revenue: data.series.revenue[index],
      payments: data.series.payments[index]
    }));
  }, [data]);

  const formatFor = useCallback(
    (value) => (active.format === 'money' ? formatMoney(value) : formatCount(value)),
    [active]
  );

  const handleRange = useCallback((next) => setDays(next), []);

  if (loading && !data) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  if (!data) return null;

  const { totals, deltas, funnel, engagement, range } = data;
  const money = active.format === 'money';

  // The funnel's bars are scaled to the first step, so "registered" is always full
  // width. Scaling to the largest step would make an empty cohort render as a
  // full-height chart of nothing.
  const cohort = funnel[0]?.count || 0;
  const hasCohort = cohort > 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-surface-100 dark:bg-surface-800">
          {RANGES.map((range) => (
            <button
              key={range.days}
              onClick={() => handleRange(range.days)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                days === range.days
                  ? 'bg-surface-0 dark:bg-surface-700 text-surface-900 dark:text-white shadow-sm'
                  : 'text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200'
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>

        <p className="text-xs text-surface-400">
          {range.from.slice(0, 10)} to {range.to.slice(0, 10)} &middot; days are UTC
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-4">
          <p className="text-2xl font-bold tabular-nums text-brand-600 dark:text-brand-400">{formatCount(totals.signups)}</p>
          <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">Signups</p>
          <p className="mt-1"><Delta delta={deltas.signups} /></p>
        </div>

        <div className="card p-4">
          <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{formatCount(totals.documents)}</p>
          <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">Documents generated</p>
          <p className="mt-1"><Delta delta={deltas.documents} /></p>
        </div>

        <div className="card p-4">
          <p className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">{formatMoney(totals.revenue)}</p>
          <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">Revenue</p>
          <p className="mt-1"><Delta delta={deltas.revenue} /></p>
        </div>

        <div className="card p-4">
          <p className="text-2xl font-bold tabular-nums text-rose-600 dark:text-rose-400">{formatCount(totals.payments)}</p>
          <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">Successful payments</p>
          <p className="mt-1"><Delta delta={deltas.payments} /></p>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-surface-900 dark:text-white">{active.label} per day</h3>
            {/* Today is only partly elapsed, so its point is expected to sit below the
                line it will eventually reach. Said here rather than left as a
                "data problem" someone reports. */}
            <p className="text-xs text-surface-400 mt-0.5">The final point is today so far.</p>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-xl bg-surface-100 dark:bg-surface-800">
            {TREND_METRICS.map((m) => (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                  metric === m.key
                    ? 'bg-surface-0 dark:bg-surface-700 text-surface-900 dark:text-white shadow-sm'
                    : 'text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="kpiFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colors.series[active.color]} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={colors.series[active.color]} stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid stroke={colors.grid} vertical={false} />
              <XAxis
                dataKey="tick"
                tick={{ fontSize: 11, fill: colors.axis }}
                tickLine={false}
                axisLine={{ stroke: colors.grid }}
                interval={tickInterval(rows.length)}
                minTickGap={4}
              />
              <YAxis
                tick={{ fontSize: 11, fill: colors.axis }}
                tickLine={false}
                axisLine={false}
                width={money ? 58 : 40}
                // Compact numbers on the axis: a full "1,234,500 XAF" on every tick
                // pushes the plot area off the card.
                tickFormatter={(value) => (money
                  ? (value >= 1000 ? `${Math.round(value / 1000)}k` : value)
                  : value)}
              />
              <Tooltip
                content={<ChartTooltip colors={colors} format={formatFor} />}
                cursor={{ stroke: colors.grid, strokeWidth: 1 }}
              />
              <Area
                type="monotone"
                dataKey={active.key}
                stroke={colors.series[active.color]}
                strokeWidth={2}
                fill="url(#kpiFill)"
                dot={false}
                activeDot={{ r: 4 }}
                // `connectNulls` is irrelevant here (every bucket is zero-filled by the
                // server), but a zero-valued day must still be plottable.
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-surface-900 dark:text-white">Activation funnel</h3>
          <p className="text-xs text-surface-400 mt-0.5 mb-4">
            Everyone who registered in this window, and how far they got.
          </p>

          {!hasCohort ? (
            <p className="text-sm text-surface-400 py-8 text-center">
              No signups in this period, so there is no cohort to follow.
            </p>
          ) : (
            <>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={funnel.map((step) => ({ ...step, label: step.label }))}
                    layout="vertical"
                    margin={{ top: 0, right: 48, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid stroke={colors.grid} horizontal={false} />
                    <XAxis type="number" hide domain={[0, cohort]} />
                    <YAxis
                      type="category"
                      dataKey="label"
                      tick={{ fontSize: 11, fill: colors.axis }}
                      tickLine={false}
                      axisLine={false}
                      width={132}
                    />
                    <Tooltip
                      content={<ChartTooltip colors={colors} format={(value) => `${formatCount(value)} users`} />}
                      cursor={{ fill: colors.grid, fillOpacity: 0.35 }}
                    />
                    <Bar dataKey="count" radius={[0, 6, 6, 0]} isAnimationActive={false}>
                      {funnel.map((step, index) => (
                        <Cell
                          key={step.key}
                          fill={[colors.series.brand, colors.series.brand, colors.series.emerald, colors.series.amber][index]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* The chart shows shape; this shows the numbers and the drop. A bar
                  chart of four counts does not tell an admin that 4 of 200 verified. */}
              <ul className="mt-4 space-y-2">
                {funnel.map((step) => (
                  <li key={step.key} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-surface-500 dark:text-surface-400">{step.label}</span>
                    <span className="flex items-center gap-3">
                      <span className="text-surface-400 tabular-nums">
                        {step.stepConversion == null
                          ? '\u2014'
                          : `${Math.round(step.stepConversion * 100)}% of previous`}
                      </span>
                      <span className="font-semibold text-surface-900 dark:text-white tabular-nums w-10 text-right">
                        {formatCount(step.count)}
                      </span>
                      <span className="text-surface-400 tabular-nums w-12 text-right">
                        {step.conversion == null ? '\u2014' : `${Math.round(step.conversion * 100)}%`}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-semibold text-surface-900 dark:text-white">Engagement</h3>
          <p className="text-xs text-surface-400 mt-0.5 mb-4">
            Users seen in each trailing window, counted now.
          </p>

          <div className="grid grid-cols-3 gap-3">
            <AdminStat label="Daily active" value={formatCount(engagement.dau)} tone="brand" />
            <AdminStat label="Weekly active" value={formatCount(engagement.wau)} tone="emerald" />
            <AdminStat label="Monthly active" value={formatCount(engagement.mau)} />
          </div>

          <dl className="mt-4 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <dt className="text-surface-500 dark:text-surface-400">Stickiness (DAU / MAU)</dt>
              <dd className="font-semibold text-surface-900 dark:text-white tabular-nums">
                {engagement.dauMauRatio == null ? '\u2014' : `${Math.round(engagement.dauMauRatio * 100)}%`}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-surface-500 dark:text-surface-400">Monthly actives / all users</dt>
              <dd className="font-semibold text-surface-900 dark:text-white tabular-nums">
                {engagement.coverage == null ? '\u2014' : `${Math.round(engagement.coverage * 100)}%`}
              </dd>
            </div>
          </dl>

          <p className="text-[11px] text-surface-400 mt-4 leading-relaxed">
            Activity is stamped at most once per user every five minutes, so these are
            counts of accounts seen recently rather than a session log. A daily history
            cannot be reconstructed from that and is deliberately not charted.
          </p>
        </div>
      </div>
    </div>
  );
}