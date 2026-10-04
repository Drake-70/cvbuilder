const ApiKey = require('../models/ApiKey');
const logger = require('../utils/logger');

// Ten live keys per account. Enough for "laptop, phone, and a few clients I keep
// forgetting about", and a ceiling that makes the list readable and stops a
// scripted caller from accumulating credentials it never revokes.
const MAX_LIVE_KEYS = 10;

const NAME_MAX = 60;

function validateName(name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) return { error: 'A name is required so you can tell your keys apart' };
  if (trimmed.length > NAME_MAX) return { error: `Name must be ${NAME_MAX} characters or fewer` };
  return { value: trimmed };
}

/**
 * Mint a key.
 *
 * The plaintext comes back once, here, and is unrecoverable afterwards -- only the
 * hash is stored. That is the whole point of hashing it, so the caller has to pass
 * the plaintext on to the user immediately; there is no "show me the key again"
 * endpoint to add later without breaking that promise.
 */
async function createKey(userId, name) {
  const checked = validateName(name);
  if (checked.error) {
    const err = new Error(checked.error);
    err.statusCode = 400;
    throw err;
  }

  const live = await ApiKey.countDocuments({ userId, revokedAt: null });
  if (live >= MAX_LIVE_KEYS) {
    const err = new Error(`You already have ${MAX_LIVE_KEYS} active keys. Revoke one before adding another.`);
    err.statusCode = 409;
    throw err;
  }

  const { plaintext, keyHash, prefix } = ApiKey.generateKey();
  const record = await ApiKey.create({ userId, name: checked.value, keyHash, prefix });

  return {
    // Returned once. Not stored, not logged, not returned by listKeys.
    key: plaintext,
    id: record._id.toString(),
    name: record.name,
    prefix: record.prefix,
    createdAt: record.createdAt
  };
}

/**
 * Every key the user can still see, plus the revoked ones.
 *
 * keyHash is `select: false` on the schema, so it does not come back even if
 * someone adds a projection by mistake.
 */
async function listKeys(userId) {
  const keys = await ApiKey.find({ userId }).sort({ createdAt: -1 });
  return keys.map(k => ({
    id: k._id.toString(),
    name: k.name,
    prefix: k.prefix,
    createdAt: k.createdAt,
    lastUsedAt: k.lastUsedAt,
    revokedAt: k.revokedAt,
    active: !k.revokedAt
  }));
}

/**
 * Revoke a key the user owns.
 *
 * Scoped by userId in the query rather than fetched-then-checked, so a key
 * belonging to someone else is reported as "not found" and never as "forbidden" --
 * a 403 would confirm the id exists.
 */
async function revokeKey(userId, keyId) {
  const key = await ApiKey.findOneAndUpdate(
    { _id: keyId, userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
    { new: true }
  );
  if (!key) return false;
  logger.info('API key revoked: %s', { keyId: String(keyId), name: key.name });
  return true;
}

/**
 * Resolve a presented key to its owner.
 *
 * Returns null for every failure -- wrong key, revoked key, deleted key -- with no
 * distinction between them, so this cannot be used to probe which keys exist.
 */
async function verifyKey(plaintext) {
  const candidate = ApiKey.normaliseCandidate(plaintext);
  // Cheap rejection before any database work: these are not our keys, and a
  // garbage bearer token should not cost a query.
  if (!candidate.startsWith(ApiKey.KEY_PREFIX)) return null;

  const record = await ApiKey.findOne({
    keyHash: ApiKey.hashKey(candidate),
    revokedAt: null
  }).select('+keyHash');

  if (!record) return null;

  // Touched on a best-effort basis and never awaited into the request path: a
  // failed write here would mean denying a valid request over a usage timestamp.
  ApiKey.updateOne({ _id: record._id }, { $set: { lastUsedAt: new Date() } }).catch(err => {
    logger.warn('Could not record API key usage: %s', err.message);
  });

  return record;
}

/**
 * A key count for the settings page, without exposing which keys exist.
 */
async function activeKeyCount(userId) {
  return ApiKey.countDocuments({ userId, revokedAt: null });
}

module.exports = {
  MAX_LIVE_KEYS,
  NAME_MAX,
  createKey,
  listKeys,
  revokeKey,
  verifyKey,
  activeKeyCount
};