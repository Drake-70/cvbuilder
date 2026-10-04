/**
 * The job board's category vocabulary.
 *
 * Extracted from jobController so that everything which filters or validates a
 * category reads the same list. The list appeared in three places -- the board
 * filter, the alert builder, and now the MCP tool schema -- and a copy per caller
 * is how a board ends up with a category nothing can filter by, or a scraper that
 * quietly files everything under "Other".
 */
const JOB_CATEGORIES = [
  'IT & Software', 'Accounting & Finance', 'Engineering', 'Sales & Marketing',
  'Healthcare', 'Education', 'Administration & HR', 'Logistics & Transport',
  'Hospitality & Tourism', 'Management', 'Other'
];

module.exports = { JOB_CATEGORIES };