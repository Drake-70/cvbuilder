const { test } = require('node:test');
const assert = require('node:assert/strict');
const { frontendUrl, allowedOrigins, DEV_ORIGIN } = require('../config/urls');

// `urls.js` reads process.env at call time, so each case can set and clear.
function withEnv(env, fn) {
  const keys = ['FRONTEND_URL', 'CORS_ORIGIN', 'RENDER_EXTERNAL_URL'];
  const saved = {};
  for (const k of keys) saved[k] = process.env[k];
  try {
    for (const k of keys) delete process.env[k];
    Object.assign(process.env, env);
    return fn();
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

test('frontendUrl falls back to localhost only when nothing is configured', () => {
  withEnv({}, () => assert.equal(frontendUrl(), DEV_ORIGIN));
});

test('frontendUrl uses RENDER_EXTERNAL_URL so a manual Render service is correct', () => {
  // The regression: a service created by hand never received the Blueprint's
  // fromService wiring, so password-reset emails linked to localhost.
  withEnv({ RENDER_EXTERNAL_URL: 'https://cvbuilder-obfc.onrender.com' }, () => {
    assert.equal(frontendUrl(), 'https://cvbuilder-obfc.onrender.com');
  });
});

test('frontendUrl prefers explicit config over the platform URL', () => {
  withEnv({
    FRONTEND_URL: 'https://explicit.example.com',
    RENDER_EXTERNAL_URL: 'https://cvbuilder-obfc.onrender.com'
  }, () => assert.equal(frontendUrl(), 'https://explicit.example.com'));
});

test('frontendUrl strips a trailing slash', () => {
  // Otherwise the reset link becomes https://host//reset-password?token=...
  withEnv({ FRONTEND_URL: 'https://cvboost.example.com/' }, () => {
    assert.equal(frontendUrl(), 'https://cvboost.example.com');
  });
});

test('allowedOrigins falls back to the platform URL', () => {
  withEnv({ RENDER_EXTERNAL_URL: 'https://cvbuilder-obfc.onrender.com' }, () => {
    assert.deepEqual(allowedOrigins(), ['https://cvbuilder-obfc.onrender.com']);
  });
});

test('allowedOrigins splits, trims and normalises a comma-separated list', () => {
  withEnv({ CORS_ORIGIN: ' https://a.example.com , https://b.example.com/ ' }, () => {
    assert.deepEqual(allowedOrigins(), ['https://a.example.com', 'https://b.example.com']);
  });
});

test('allowedOrigins never returns an empty allowlist', () => {
  withEnv({ CORS_ORIGIN: '   ' }, () => {
    assert.deepEqual(allowedOrigins(), [DEV_ORIGIN]);
  });
});
