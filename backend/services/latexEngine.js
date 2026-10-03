// The LaTeX engine boundary.
//
// Everything that touches the filesystem or spawns a process lives here, so the
// document builder in latexService.js stays pure and the fallback in pdfService.js
// stays a two-line branch. The four properties that matter:
//
//   1. Absence is expected, not exceptional. The engine is installed by the
//      Dockerfile and nowhere else, so a dev machine, a test run and a container
//      built before this feature all have no engine. That has to be a value, not
//      a crash.
//   2. The compiler never touches the network at request time. `--only-cached`
//      makes a missing package a fast, local failure instead of an outbound fetch
//      that can hang for the whole request timeout.
//   3. The .tex source is never servable. It is written into a private temp
//      directory that is removed in a finally, and no route returns it. This
//      matters because the source contains the whole CV, so it inherits every
//      privacy property the download route has -- and the download route is
//      payment-gated.
//   4. "Available" is a claim the picker can rely on. It is established by
//      actually compiling, not by finding a file, so a broken cache or a missing
//      font hides the LaTeX templates instead of offering them and silently
//      substituting a different document on every export.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const logger = require('../utils/logger');
const { buildLatexDocument, LATEX_TEMPLATES } = require('./latexService');

// Overridable so a developer with tectonic installed on their PATH can try the
// LaTeX path without rebuilding the image. The default is where the Dockerfile
// puts the static binary.
const TECTONIC_BIN = process.env.TECTONIC_BIN || '/usr/local/bin/tectonic';

// A warm cache makes this a few hundred milliseconds; a cold one would be tens of
// seconds. This bound is the difference between a slow response and a hung
// request that holds a Node worker open.
const COMPILE_TIMEOUT_MS = Number(process.env.LATEX_TIMEOUT_MS) || 20000;

// The probe compiles for real, so it gets its own budget. It runs once per
// process and is what the template picker waits on.
const PROBE_TIMEOUT_MS = Number(process.env.LATEX_PROBE_TIMEOUT_MS) || 15000;

// Tectonic logs its file access to stderr. It is verbose enough that the default
// 1MB buffer can be exhausted by a large document, which surfaces as an ENOBUFS
// spawn error rather than as a log line.
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

// `-X compile` is the V2 subcommand form. The V1 flags are identical, but the V2
// interface is the documented forward path and `-X` is stated to be supported
// indefinitely, whereas V1 is scheduled for removal.
const ARGS = {
  compile: ['-X', 'compile', '--outfmt', 'pdf', '--only-cached', '--untrusted'],
  version: ['-X', 'compile', '--help']
};

function spawn(args, timeout) {
  return execFileSync(TECTONIC_BIN, args, {
    timeout,
    maxBuffer: MAX_OUTPUT_BYTES,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8'
  });
}

// An unparseable .tex leaves tectonic's diagnostics in the log. They name a line
// in the generated document, not the CV field that produced it, so they are
// truncated rather than dumped in full -- a long CV produces a long log.
function describeFailure(stderr, err) {
  const detail = String(stderr || err.message || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .slice(-4)
    .join(' | ');
  return (err.killed ? `timed out after ${COMPILE_TIMEOUT_MS}ms` : err.message) +
    (detail ? `: ${detail.slice(0, 400)}` : '');
}

let available;

/**
 * Whether this build can render LaTeX, established by rendering something.
 *
 * A file-existence check is not enough. The engine can be present while the
 * bundle cache is missing (a stripped image), while a font package is absent
 * from the cache, or while the pinned CLI no longer accepts the flags below --
 * and in every one of those cases a `--version` probe succeeds and every export
 * falls back. So the probe compiles a minimal document through the real builder
 * with the real flags, which is the only check that proves the claim the picker
 * makes. It costs a few hundred milliseconds once per process.
 *
 * Never throws.
 */
function isAvailable() {
  if (available !== undefined) return available;

  try {
    // `--help` first: it fails in milliseconds if the binary is missing or the
    // CLI shape changed, rather than after the full compile budget.
    spawn(ARGS.version, PROBE_TIMEOUT_MS);

    const probeName = LATEX_TEMPLATES[0];
    if (!probeName) {
      available = false;
      return false;
    }
    const source = buildLatexDocument({ name: 'Probe' }, { template: probeName });
    const buffer = compile(source, PROBE_TIMEOUT_MS);

    if (!buffer || buffer.length === 0) throw new Error('probe produced an empty PDF');

    available = true;
  } catch (err) {
    available = false;
    // Logged once, not per request. A missing engine is a deployment fact, and
    // the fallback in pdfService is what handles it, so this is informational.
    logger.warn(
      'LaTeX unavailable at %s (%s); PDF export falls back to pdfkit and the ' +
      'LaTeX templates are hidden from the picker.',
      TECTONIC_BIN, err.code === 'ENOENT' ? 'not found' : err.message
    );
  }

  return available;
}

/**
 * Compile LaTeX source to a PDF.
 *
 * @param {string} source complete LaTeX document
 * @param {number} [timeout] override the compile budget, for the probe
 * @returns {Buffer} the rendered PDF
 * @throws {Error} with `.latex = true` when the engine is missing or the
 *   document did not compile. The caller falls back to pdfkit on that flag.
 */
function compile(source, timeout = COMPILE_TIMEOUT_MS) {
  // mkdtemp rather than a fixed name: a fixed name is a symlink attack and a
  // collision between two simultaneous exports.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-latex-'));
  const sourcePath = path.join(dir, 'cv.tex');

  try {
    fs.writeFileSync(sourcePath, source, 'utf8');

    let stdout;
    try {
      stdout = spawn([...ARGS.compile, '--outdir', dir, sourcePath], timeout);
    } catch (err) {
      const wrapped = new Error(`LaTeX compile failed: ${describeFailure(err.stderr, err)}`);
      wrapped.latex = true;
      wrapped.code = 'COMPILE_FAILED';
      throw wrapped;
    }

    const pdfPath = path.join(dir, 'cv.pdf');
    if (!fs.existsSync(pdfPath)) {
      // Tectonic exited 0 without producing a file. Treated as a failure rather
      // than an empty success, because an empty buffer would be a 500 later with
      // a far less useful message.
      const err = new Error('LaTeX compile failed: engine produced no PDF');
      err.latex = true;
      err.code = 'NO_OUTPUT';
      throw err;
    }

    const buffer = fs.readFileSync(pdfPath);
    // A zero-length or non-PDF file would sail past the existence check above.
    if (buffer.length === 0 || buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
      const err = new Error('LaTeX compile failed: output is not a PDF');
      err.latex = true;
      err.code = 'NOT_A_PDF';
      throw err;
    }

    return buffer;
  } finally {
    // The temp directory holds the CV in plaintext. Removed on every path,
    // including a timeout kill, which is why this is a finally and not a
    // success-path step.
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (err) {
      logger.warn('Could not remove LaTeX temp dir %s: %s', dir, err.message);
    }
  }
}

// Exposed for the tests, which need to reason about the fallback without a
// compiler installed. Not part of the module's contract with pdfService.
function _resetProbe() {
  available = undefined;
}

exports.compile = compile;
exports.isAvailable = isAvailable;
exports.TECTONIC_BIN = TECTONIC_BIN;
exports.COMPILE_TIMEOUT_MS = COMPILE_TIMEOUT_MS;
exports._resetProbe = _resetProbe;