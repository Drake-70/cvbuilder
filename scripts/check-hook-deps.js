// Catch React hook dependency arrays that read a binding before it is initialised.
//
// Why this exists as a script rather than a lint rule: the bug it guards against is
// "Cannot access 'X' before initialization", a temporal-dead-zone ReferenceError. oxlint
// 1.71.0 registers `no-use-before-define` but does not implement it (every column of its
// rule table is empty), so the rule silently does nothing and the crash ships. `rules-of-
// hooks` does not catch it either, because the hook order here is perfectly legal -- only the
// reference is too early.
//
// The failure mode is severe and quiet: the page does not render wrong, it renders nothing,
// on every visit, for every user, and nothing in CI objects.
//
// Usage: node scripts/check-hook-deps.js [src-dir]
// Exit 0 when clean, 1 when a dependency is read before its declaration.
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(process.argv[2] || path.join(__dirname, '..', 'frontend', 'src'));
const EXT = /\.jsx?$/;
const HOOKS = ['useEffect', 'useLayoutEffect', 'useMemo', 'useCallback', 'useImperativeHandle'];

/**
 * Extract the dependency array of a hook call starting at its opening paren.
 *
 * This is a scanner rather than a regex because the call can contain nested calls,
 * object/array literals, template strings and comments, all of which contain parens and
 * commas that a naive split would misread. Tracking depth and lexical state is the minimum
 * needed to find the call's real end and the real start of its last argument.
 */
function depsArrayAt(src, openParen) {
  let depth = 0;
  let i = openParen;
  let lastTopComma = -1;
  let state = 'code';
  let quote = '';

  for (; i < src.length; i++) {
    const c = src[i];
    const next = src[i + 1];

    if (state === 'line-comment') { if (c === '\n') state = 'code'; continue; }
    if (state === 'block-comment') { if (c === '*' && next === '/') { state = 'code'; i++; } continue; }
    if (state === 'string') {
      if (c === '\\') { i++; continue; }
      if (c === quote) state = 'code';
      continue;
    }
    if (state === 'template') {
      if (c === '\\') { i++; continue; }
      if (c === '`') state = 'code';
      continue; // ${} interpolation can nest; good enough for dep arrays, which rarely use it
    }

    if (c === '/' && next === '/') { state = 'line-comment'; i++; continue; }
    if (c === '/' && next === '*') { state = 'block-comment'; i++; continue; }
    if (c === '"' || c === "'") { state = 'string'; quote = c; continue; }
    if (c === '`') { state = 'template'; continue; }

    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') {
      depth--;
      if (depth === 0) {
        // End of the call. The deps array, if any, is the final argument.
        const tail = src.slice(lastTopComma + 1, i);
        const trimmed = tail.trim();
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
          return { text: trimmed, endIndex: i };
        }
        return null;
      }
    } else if (c === ',' && depth === 1) {
      lastTopComma = i;
    }
  }
  return null;
}

const findings = [];

function checkFile(file) {
  const src = fs.readFileSync(file, 'utf8');

  // Every const/let binding declared in the file, with its line.
  const declared = new Map(); // name -> [lines]
  const declRe = /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/g;
  let m;
  while ((m = declRe.exec(src))) {
    const line = src.slice(0, m.index).split('\n').length;
    if (!declared.has(m[1])) declared.set(m[1], []);
    declared.get(m[1]).push(line);
  }

  const lineOf = (idx) => src.slice(0, idx).split('\n').length;

  for (const hook of HOOKS) {
    const re = new RegExp(`\\b${hook}\\s*\\(`, 'g');
    let h;
    while ((h = re.exec(src))) {
      const openParen = h.index + h[0].length - 1;
      const found = depsArrayAt(src, openParen);
      if (!found) continue;
      const hookLine = lineOf(h.index);

      // Dependency arrays are identifiers, occasionally with a member or a call.
      const body = found.text.slice(1, -1);
      for (const rawDep of body.split(',')) {
        const dep = rawDep.trim();
        if (!dep) continue;
        const name = dep.split(/[.\s[(]/)[0].replace(/^\.\.\./, '').trim();
        if (!/^[A-Za-z_$][\w$]*$/.test(name)) continue;

        const lines = declared.get(name);
        if (!lines) continue;
        // Only a problem if *every* declaration sits below the hook: any declaration above
        // it means the identifier is initialised by the time render reaches this line.
        if (lines.every((l) => l > hookLine)) {
          findings.push({
            file: path.relative(process.cwd(), file).replace(/\\/g, '/'),
            hook, dep, hookLine, declaredAt: lines,
          });
        }
      }
    }
  }
}

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(full); }
    else if (EXT.test(e.name)) checkFile(full);
  }
}

walk(SRC);

if (!findings.length) {
  console.log(`hook dependency order: OK (${path.relative(process.cwd(), SRC)} scanned)`);
  process.exit(0);
}

console.log(`hook dependency order: ${findings.length} problem(s)\n`);
for (const f of findings) {
  console.log(`  ${f.file}:${f.hookLine}  ${f.hook}(..., [${f.dep}])`);
  console.log(`      '${f.dep}' is declared at line ${f.declaredAt.join(', ')}, after the hook.`);
  console.log(`      This throws "Cannot access '${f.dep}' before initialization" on every render.\n`);
}
process.exit(1);
