const path = require('path');

// jszip lives in backend/node_modules rather than the root, because only the backend
// renders documents. Resolved by path for the same reason mongoose is in
// helpers/verifiedUser.js: the specs run from the repo root, where that dependency is
// not on the module path.
const JSZip = require(path.join(__dirname, '..', '..', 'backend', 'node_modules', 'jszip'));

/**
 * Whether a rendered .docx contains the given text once its parts are inflated.
 *
 * A docx is a zip, so every string inside it is deflated and cannot be found with a
 * substring search over the raw bytes. Decompressing is what makes "the watermark is
 * actually in the document" a checkable claim rather than an inference from a header.
 *
 * @param {Buffer} buffer the .docx response body
 * @param {string} needle text to look for
 * @returns {Promise<boolean>}
 */
async function docxContainsText(buffer, needle) {
  const zip = await JSZip.loadAsync(buffer);
  const parts = Object.values(zip.files).filter((f) => !f.dir);

  for (const part of parts) {
    const content = await part.async('string');
    if (content.includes(needle)) return true;
  }

  return false;
}

module.exports = { docxContainsText };