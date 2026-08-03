const { PostHog } = require('posthog-node');

const enabled = Boolean(process.env.POSTHOG_PROJECT_TOKEN);

let client = null;
if (enabled) {
  client = new PostHog(process.env.POSTHOG_PROJECT_TOKEN, {
    host: process.env.POSTHOG_HOST || 'https://us.i.posthog.com',
    enableExceptionAutocapture: true,
    flushAt: 20,
    flushInterval: 5000
  });
}

function safe(fn) {
  try {
    fn();
  } catch {
    // Analytics must never break the request path
  }
}

function distinctIdFor(req) {
  return req?.user?._id ? req.user._id.toString() : 'anonymous';
}

module.exports = {
  enabled,
  capture: (event, distinctId, properties) => {
    if (!enabled || !distinctId) return;
    safe(() => client.capture({ distinctId, event, properties: properties || {} }));
  },
  captureFor: (req, event, properties) => {
    if (!enabled) return;
    safe(() => client.capture({ distinctId: distinctIdFor(req), event, properties: properties || {} }));
  },
  identify: (distinctId, properties) => {
    if (!enabled || !distinctId) return;
    safe(() => client.identify({ distinctId, properties: properties || {} }));
  },
  captureException: (error, distinctId, additionalProperties) => {
    if (!enabled) return;
    safe(() => client.captureException(error, distinctId || 'anonymous', additionalProperties || {}));
  },
  flush: () => client && client.flush().catch(() => {})
};
