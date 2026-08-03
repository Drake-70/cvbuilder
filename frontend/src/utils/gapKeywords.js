import { createElement } from 'react';

const STOP_WORDS = new Set([
  'and', 'the', 'a', 'an', 'to', 'for', 'of', 'in', 'on', 'with', 'that', 'this',
  'more', 'from', 'as', 'at', 'by', 'you', 'your', 'add', 'adding', 'include',
  'including', 'mention', 'mentioning', 'use', 'using', 'used', 'related', 'show',
  'shows', 'showing', 'list', 'qualify', 'quantify', 'emphasize', 'strengthen',
  'highlight', 'make', 'made', 'such', 'per', 'each', 'their', 'them', 'his', 'her',
  'it', 'be', 'are', 'is', 'was', 'were', 'have', 'has', 'had', 'key', 'keys',
  'missing', 'with', 'without', 'strong', 'better', 'like', 'also', 'both', 'than'
]);

const QUOTE_RE = /['"`]([^'"`]{2,})['"`]/g;

export function extractKeywords(gapText) {
  const src = String(gapText || '');
  const quoted = [];
  let m;
  while ((m = QUOTE_RE.exec(src)) !== null) quoted.push(m[1].trim());
  if (quoted.length) return quoted;

  const words = src
    .toLowerCase()
    .replace(/[^a-z0-9\u00E0-\u00FF -]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  const bigrams = [];
  for (let i = 0; i < words.length - 1; i++) {
    const bigram = `${words[i]} ${words[i + 1]}`;
    if (!bigram.split(' ').some((w) => STOP_WORDS.has(w))) bigrams.push(bigram);
  }
  return bigrams.slice(0, 6);
}

export function flattenCV(cv, coverLetter) {
  const parts = [];
  if (cv?.summary) parts.push(cv.summary);
  (cv?.experience || []).forEach((e) => {
    if (e.title) parts.push(e.title);
    if (e.company) parts.push(e.company);
    (e.bullets || []).forEach((b) => parts.push(b));
  });
  (cv?.education || []).forEach((e) => {
    if (e.degree) parts.push(e.degree);
    if (e.institution) parts.push(e.institution);
    if (e.details) parts.push(e.details);
  });
  if (cv?.skills?.length) parts.push(cv.skills.join(' '));
  if (cv?.languages?.length) parts.push(cv.languages.join(' '));
  (cv?.additionalSections || []).forEach((s) => parts.push(s.content || s.title || ''));
  if (coverLetter) parts.push(coverLetter);
  return parts.join('\n');
}

export function analyzeGaps(gaps, cv, coverLetter) {
  const afterLower = flattenCV(cv, coverLetter).toLowerCase();
  return (gaps || []).map((gap) => {
    const keywords = extractKeywords(gap);
    const matched = keywords.filter((k) => afterLower.includes(k.toLowerCase()));
    return { gap, keywords, matched };
  });
}

export function highlightText(text, terms, markClass = 'cv-hl-new') {
  if (!text) return text;
  const clean = String(text);
  if (!terms || terms.length === 0) return clean;

  const lower = clean.toLowerCase();
  const ranges = [];
  for (const term of terms) {
    const t = String(term).toLowerCase();
    if (!t) continue;
    let idx = lower.indexOf(t);
    while (idx !== -1) {
      ranges.push([idx, idx + t.length]);
      idx = lower.indexOf(t, idx + 1);
    }
  }
  if (!ranges.length) return clean;

  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }

  const parts = [];
  let cursor = 0;
  merged.forEach(([s, e]) => {
    if (s > cursor) parts.push(clean.slice(cursor, s));
    parts.push(createElement('mark', { key: parts.length, className: markClass }, clean.slice(s, e)));
    cursor = e;
  });
  if (cursor < clean.length) parts.push(clean.slice(cursor));
  return parts;
}
