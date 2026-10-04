const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * A personal access token for the MCP server.
 *
 * The web app authenticates with a JWT in an httpOnly cookie, which is the right
 * shape for a browser and the wrong one for a program: a cookie is not something an
 * MCP client can send, and handing a session token to a third-party integration
 * means revoking every session to cut it off. So this is a separate credential with
 * its own lifecycle -- created, listed and revoked individually, and surviving
 * logout.
 *
 * Separate document rather than an array on User: keys are looked up on every
 * request by hash, before any user is known, so they need their own index and
 * cannot be found by loading the user first.
 */
const apiKeySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  // What the user called it. "Claude Desktop", "phone", or whatever they will
  // recognise in six months when deciding what to revoke.
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 60
  },
  // SHA-256 of the key, hex. Not bcrypt, and the difference is deliberate: a
  // password is low-entropy and needs a slow hash to be worth stealing, whereas
  // this is 32 bytes of CSPRNG output where there is nothing to guess. bcrypt here
  // would put a ~100 ms cost on every MCP request to defend against an attack
  // that cannot be mounted.
  // No `unique: true` here on purpose. Declaring it here *and* in the explicit index
  // below asks mongoose for two unique indexes on the same column, which it builds
  // and then complains about every time the model is compiled.
  keyHash: {
    type: String,
    required: true,
    select: false
  },
  // The first characters of the key, stored so the settings list can identify a
  // key without being able to reconstruct it. The plaintext is shown once, at
  // creation, and is not recoverable afterwards.
  prefix: {
    type: String,
    required: true
  },
  lastUsedAt: {
    type: Date,
    default: null
  },
  // Set rather than deleted, so a revoked key's history stays attributable and a
  // deletion cannot be mistaken for "never existed".
  revokedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

// A revoked key is still in the unique index, so the lookup has to skip it --
// otherwise revoking and reissuing could collide, and a live lookup would have to
// consider revoked rows on every request.
apiKeySchema.index({ keyHash: 1 }, { unique: true });
apiKeySchema.index({ userId: 1, revokedAt: 1 });

// The key as the user sees and pastes it. The `cvb_` prefix is what makes a
// pasted key identifiable in a config file, and what lets the auth middleware
// reject an obvious non-key before doing any database work.
const KEY_PREFIX = 'cvb_';
const KEY_RANDOM_BYTES = 32;
const KEY_DISPLAY_CHARS = 12;

function generateKey() {
  const secret = crypto.randomBytes(KEY_RANDOM_BYTES).toString('hex');
  return {
    plaintext: `${KEY_PREFIX}${secret}`,
    keyHash: hashKey(`${KEY_PREFIX}${secret}`),
    // Display prefix only. The hash is not derivable from it, and vice versa.
    prefix: `${KEY_PREFIX}${secret.slice(0, KEY_DISPLAY_CHARS)}`
  };
}

function hashKey(plaintext) {
  return crypto.createHash('sha256').update(String(plaintext)).digest('hex');
}

// Accepts the raw key, or an `Authorization: Bearer <key>` header value, so the
// caller does not have to know which form the transport handed it.
function normaliseCandidate(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  const bearer = /^Bearer\s+(.+)$/i.exec(trimmed);
  return (bearer ? bearer[1] : trimmed).trim();
}

module.exports = mongoose.model('ApiKey', apiKeySchema);
module.exports.KEY_PREFIX = KEY_PREFIX;
module.exports.generateKey = generateKey;
module.exports.hashKey = hashKey;
module.exports.normaliseCandidate = normaliseCandidate;