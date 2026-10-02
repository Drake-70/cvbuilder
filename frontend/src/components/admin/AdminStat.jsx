/**
 * A single labelled figure.
 *
 * `tone` is a name rather than a class so callers cannot invent a colour that has
 * no dark-mode counterpart — the previous stat grid passed Tailwind strings
 * through a lookup map, which silently fell back to one shared class for any
 * tone it did not recognise.
 */
const TONES = {
  brand: 'text-brand-600 dark:text-brand-400',
  emerald: 'text-emerald-600 dark:text-emerald-400',
  amber: 'text-amber-600 dark:text-amber-400',
  rose: 'text-rose-600 dark:text-rose-400',
  slate: 'text-surface-500 dark:text-surface-400'
};

export default function AdminStat({ label, value, hint, tone = 'slate', to }) {
  const body = (
    <>
      <p className={`text-2xl font-bold tabular-nums ${TONES[tone] || TONES.slate}`}>{value}</p>
      <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">{label}</p>
      {hint && <p className="text-[11px] text-surface-400 mt-1 leading-tight">{hint}</p>}
    </>
  );

  if (to) {
    return (
      <a href={`#${to}`} className="card p-4 text-center block cursor-pointer hover:border-brand-300 dark:hover:border-brand-600 transition-colors">
        {body}
      </a>
    );
  }

  return <div className="card p-4 text-center">{body}</div>;
}
