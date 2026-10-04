// Input sanitization middleware
// Strips dangerous characters from string fields in request body
function stripHtml(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/<[^>]*>/g, '').trim();
}

function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'string') {
      obj[key] = stripHtml(obj[key]);
    } else if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
      sanitizeObject(obj[key]);
    } else if (Array.isArray(obj[key])) {
      obj[key] = obj[key].map(item =>
        typeof item === 'string' ? stripHtml(item) :
        typeof item === 'object' ? sanitizeObject(item) : item
      );
    }
  }
  return obj;
}

function sanitize(req, _res, next) {
  // Not applied to MCP tool arguments.
  //
  // stripHtml removes anything that looks like a tag, which is the right blunt rule
  // for a short profile field and the wrong one for a CV: "array<int>", "3 < 5 years"
  // of experience and "a < b > c" are all legitimate CV text, and all of them come
  // back silently altered. A tool caller would get a score for a CV they never sent,
  // with no error and no way to tell.
  //
  // Nothing here is rendered as HTML either. The arguments go to the scoring
  // services, to the AI prompt, or to fields Zod has length-checked, and React
  // escapes anything it does render. The endpoint also requires an API key rather
  // than an ambient cookie, so it is not a cross-site vector in the first place.
  if (req.path === '/api/mcp') return next();

  if (req.body && typeof req.body === 'object') {
    sanitizeObject(req.body);
  }
  next();
}

module.exports = sanitize;
