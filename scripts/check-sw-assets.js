// Guards the service worker's fetch strategy for hashed build assets.
//
// The failure this prevents is not hypothetical. sw.js used to answer every
// same-origin GET from the cache before touching the network. Vite content-
// hashes asset filenames, so a new deploy normally misses the cache and
// fetches fresh — which is why the cache-first policy looked harmless. It
// stops being harmless the moment the network fails:
//
//   1. navigation throws, the SW serves the cached shell
//   2. that shell names the previous deploy's entry chunk, also cached
//   3. every chunk that entry imports is cached too
//   4. the client boots an entire older build and revalidates none of it
//
// A crash fixed in the new build then stays broken for that client
// indefinitely. This was observed in production: a fixed DocumentDetailPage
// crash kept reproducing because the browser was running a cached build whose
// chunk no longer existed on the server.
//
// The invariant: /assets/ must be network-first, with the cache used only as
// an unreachable fallback. Everything else may stay cache-first.
const fs = require('fs');
const path = require('path');

// Overridable so the policy can be checked against a fixture, which is how
// this guard was proven to fail on the shape it is meant to catch.
const swPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, '..', 'frontend', 'public', 'sw.js');
const source = fs.readFileSync(swPath, 'utf8');

const failures = [];

const hasAssetsGuard = /url\.pathname\.startsWith\(\s*['"]\/assets\/['"]\s*\)/.test(source);
if (!hasAssetsGuard) {
  failures.push(
    'no /assets/ branch in the fetch handler: hashed build assets are being ' +
      'answered from the cache before the network is tried, so a client that ' +
      'loses connectivity can be pinned to a previous deploy indefinitely'
  );
}

// Within the /assets/ branch the network call must come first, and the cache
// must only be consulted in the failure path.
const branch = source.slice(source.indexOf('/assets/'));
const networkAt = branch.indexOf('await fetch(event.request)');
const cacheAt = branch.indexOf('caches.match(event.request)');
if (networkAt === -1) {
  failures.push('/assets/ branch never reaches the network');
} else if (cacheAt !== -1 && cacheAt < networkAt) {
  failures.push('/assets/ branch consults the cache before the network');
}

const cacheName = source.match(/const CACHE_NAME = ['"]([^'"]+)['"]/);
if (!cacheName) {
  failures.push('CACHE_NAME is missing: old bundles can never be evicted');
}

if (failures.length) {
  console.error('service worker asset policy: FAIL');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  `service worker asset policy: OK (${cacheName[1]}, network-first for /assets/)`
);
