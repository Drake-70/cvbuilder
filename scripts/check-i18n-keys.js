// Duplicate keys in a JSON object are legal to the parser and fatal to the
// author: JSON.parse keeps the last one and silently discards the earlier value.
// In a translation file that means a string silently becomes an object, and
// t('thatKey') then renders the key itself instead of the text.
const fs = require('fs');
const path = require('path');

const dir = process.argv[2] || path.join(process.cwd(), 'frontend', 'src', 'locales');

let total = 0;
for (const locale of fs.readdirSync(dir)) {
  for (const file of fs.readdirSync(path.join(dir, locale))) {
    if (!file.endsWith('.json')) continue;
    const raw = fs.readFileSync(path.join(dir, locale, file), 'utf8');

    const dups = new Set();
    const seen = new Set();
    // Top-level keys are the ones i18next resolves a bare t('x') against, so a
    // duplicate at depth 1 is the one that changes rendered output.
    for (const m of raw.matchAll(/^ {2}"([^"]+)"\s*:/gm)) {
      if (seen.has(m[1])) dups.add(m[1]);
      seen.add(m[1]);
    }

    if (dups.size) {
      total += dups.size;
      const parsed = JSON.parse(raw);
      const detail = [...dups].map((k) => `${k} (now a ${typeof parsed[k]})`).join(', ');
      console.log(`${locale}/${file}: ${[...dups].length} duplicate(s): ${detail}`);
    }
  }
}
console.log(total === 0 ? 'no duplicate top-level keys' : `${total} duplicate key(s)`);