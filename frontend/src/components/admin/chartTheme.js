/**
 * Chart colours for Recharts.
 *
 * Recharts draws SVG attributes, not Tailwind classes, so it cannot resolve
 * `dark:` variants the way the rest of the app does. The colours are therefore
 * chosen here in JS, keyed off the app's own theme rather than the OS preference:
 * the app lets a user override the system setting, and a chart that followed
 * `prefers-color-scheme` would disagree with the page it sits on.
 *
 * Every value is taken from the same palette as `index.css`, so a chart colour and
 * a text colour that mean the same thing are the same hex.
 *
 * Deliberately not `var(--token)`: the palette is redefined under `.dark`, and
 * passing `var()` into a presentation attribute works in some engines and not
 * others. A chart that renders black-on-black in one browser is not worth the
 * elegance.
 */
export function chartColors(theme) {
  const dark = theme === 'dark';

  return {
    grid: dark ? '#262b33' : '#eef2f8',
    axis: dark ? '#94a3b8' : '#64748b',
    // One colour per series, reused across every chart on the page so "the amber
    // line" means the same metric on the trend chart and the funnel.
    series: {
      brand: dark ? '#60a5fa' : '#3b82f6',
      emerald: dark ? '#34d399' : '#10b981',
      amber: dark ? '#fbbf24' : '#f59e0b',
      rose: dark ? '#fb7185' : '#f43f5e',
      slate: dark ? '#94a3b8' : '#64748b'
    },
    tooltip: {
      background: dark ? '#16181d' : '#ffffff',
      border: dark ? '#262b33' : '#eef2f8',
      text: dark ? '#ffffff' : '#0f172a'
    }
  };
}

/**
 * The metrics the trend chart can show, one at a time.
 *
 * One measure per chart rather than several on twin axes. Signups and revenue share
 * a chart only if one axis is scaled to the other, and the crossover point then
 * becomes a visual event that means nothing -- the line crossing mid-height says
 * nothing about either series. Switching between them keeps every chart readable
 * and the comparison honest.
 */
export const TREND_METRICS = [
  { key: 'signups', label: 'Signups', color: 'brand', format: 'count' },
  { key: 'documents', label: 'Documents', color: 'emerald', format: 'count' },
  { key: 'revenue', label: 'Revenue', color: 'amber', format: 'money' },
  { key: 'payments', label: 'Payments', color: 'rose', format: 'count' }
];

/** Axis tick labels are thinned so a 90-day range does not print 90 dates. */
export function tickInterval(labelCount) {
  if (labelCount <= 14) return 0;
  return Math.ceil(labelCount / 12);
}