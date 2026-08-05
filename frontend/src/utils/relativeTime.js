export function relativeTime(dateStr, t) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return t?.('today') || 'Today';
  if (minutes < 60) return t?.('minutes_ago', { n: minutes }) || `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t?.('hours_ago', { n: hours }) || `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return t?.('days_ago', { n: days }) || `${days}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
