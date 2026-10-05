const zlib = require('node:zlib');

// A .docx is a zip, so nothing inside it is findable with a substring search over the
// raw response: every part is deflated. This inflates the parts so a test can assert on
// the text a reader would actually see.
//
// Only node:zlib is used. The obvious alternative is jszip, which the backend already has
// -- as a transitive dependency of `docx`, not a declared one. Requiring it from
// backend/node_modules by path works only while npm keeps hoisting it there, and the
// failure mode when it stops is a `Cannot find module` thrown while Playwright collects
// the specs, which aborts the whole run before a single test executes and leaves no JSON
// report behind. A zip central directory is a fixed-format table; parsing it is cheaper
// than depending on someone else's dependency tree.

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

const CENTRAL_HEADER_SIZE = 46;
const LOCAL_HEADER_SIZE = 30;

const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

// The 0xFFFFFFFF/0xFFFF sentinels mean "look in the Zip64 record", which this reader
// does not implement. Saying so beats returning empty parts and failing an assertion
// that looks like a watermark bug.
const ZIP64_SENTINEL_16 = 0xffff;
const ZIP64_SENTINEL_32 = 0xffffffff;

function findEndOfCentralDirectory(buffer) {
  // The EOCD is at the end, after a variable-length comment, so it is searched from the
  // back rather than at a fixed offset.
  const earliest = Math.max(0, buffer.length - 0xffff - 22);
  for (let at = buffer.length - 22; at >= earliest; at -= 1) {
    if (buffer.readUInt32LE(at) === EOCD_SIGNATURE) return at;
  }
  return -1;
}

/** One entry per part, with the offsets needed to inflate it. */
function readCentralDirectory(buffer, eocdAt) {
  const entryCount = buffer.readUInt16LE(eocdAt + 10);
  if (entryCount === ZIP64_SENTINEL_16) {
    throw new Error('zip64 archives are not supported by this reader');
  }

  let at = buffer.readUInt32LE(eocdAt + 16);
  const entries = [];

  for (let i = 0; i < entryCount; i += 1) {
    if (buffer.readUInt32LE(at) !== CENTRAL_SIGNATURE) {
      throw new Error(`corrupt zip: expected a central directory header at byte ${at}`);
    }
    const method = buffer.readUInt16LE(at + 10);
    const compressedSize = buffer.readUInt32LE(at + 20);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const localOffset = buffer.readUInt32LE(at + 42);

    if (compressedSize === ZIP64_SENTINEL_32 || localOffset === ZIP64_SENTINEL_32) {
      throw new Error('zip64 archives are not supported by this reader');
    }

    entries.push({
      name: buffer.toString('utf8', at + CENTRAL_HEADER_SIZE, at + CENTRAL_HEADER_SIZE + nameLength),
      method,
      compressedSize,
      localOffset,
    });

    at += CENTRAL_HEADER_SIZE + nameLength + extraLength + commentLength;
  }

  return entries;
}

function inflateEntry(buffer, entry) {
  const headerAt = entry.localOffset;
  if (buffer.readUInt32LE(headerAt) !== LOCAL_SIGNATURE) {
    throw new Error(`corrupt zip: expected a local header for ${entry.name}`);
  }

  // The local header repeats the name and extra lengths, and its extra field can differ
  // in length from the central one, so the data offset has to be computed from this
  // header rather than reused.
  const nameLength = buffer.readUInt16LE(headerAt + 26);
  const extraLength = buffer.readUInt16LE(headerAt + 28);
  const start = headerAt + LOCAL_HEADER_SIZE + nameLength + extraLength;
  const raw = buffer.subarray(start, start + entry.compressedSize);

  if (entry.method === METHOD_STORED) return raw;
  if (entry.method === METHOD_DEFLATE) return zlib.inflateRawSync(raw);
  throw new Error(`unsupported zip compression method ${entry.method} for ${entry.name}`);
}

/** The inflated text of every part in a .docx, keyed by part name. */
function docxParts(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('docxParts expects a Buffer');
  if (buffer.length < 22 || buffer.readUInt32LE(0) !== LOCAL_SIGNATURE) {
    throw new Error('not a docx: no local file header at the start of the buffer');
  }

  const eocdAt = findEndOfCentralDirectory(buffer);
  if (eocdAt === -1) throw new Error('corrupt zip: no end of central directory record');

  const parts = {};
  for (const entry of readCentralDirectory(buffer, eocdAt)) {
    // Directory entries carry no content and a zero compressed size.
    if (entry.compressedSize === 0) continue;
    parts[entry.name] = inflateEntry(buffer, entry).toString('utf8');
  }
  return parts;
}

/**
 * Whether a rendered .docx contains the given text once its parts are inflated.
 *
 * Checked against the document rather than the X-Watermarked header, because the header
 * can be set without the watermark ever reaching the rendered file -- which is the whole
 * difference between a user seeing "FREE PREVIEW" and not.
 *
 * @param {Buffer} buffer the .docx response body
 * @param {string} needle text to look for
 * @returns {boolean}
 */
function docxContainsText(buffer, needle) {
  return Object.values(docxParts(buffer)).some((text) => text.includes(needle));
}

module.exports = { docxContainsText, docxParts };