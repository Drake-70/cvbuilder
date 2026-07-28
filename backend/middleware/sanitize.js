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
  if (req.body && typeof req.body === 'object') {
    sanitizeObject(req.body);
  }
  next();
}

module.exports = sanitize;
