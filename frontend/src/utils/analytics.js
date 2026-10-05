// PostHog is loaded on demand. It used to be a static import of the entry
// chunk, so the browser downloaded and parsed the SDK before the app could
// paint. Events raised before it arrives are queued rather than dropped, so
// the sequence `identify` then `track` on first paint still reports in order.
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

const enabled = () => Boolean(POSTHOG_KEY && typeof window !== 'undefined');

let posthog = null;
let loading = null;
const queue = [];

function load() {
  if (!enabled()) return Promise.resolve(null);
  if (posthog) return Promise.resolve(posthog);
  if (!loading) {
    loading = import('posthog-js')
      .then((mod) => {
        const client = mod.default;
        client.init(POSTHOG_KEY, {
          api_host: POSTHOG_HOST,
          autocapture: false,
          capture_pageview: false,
          persistence: 'localStorage'
        });
        posthog = client;
        while (queue.length) {
          const [fn, args] = queue.shift();
          fn(client, args);
        }
        return client;
      })
      .catch(() => {
        loading = null;
        return null;
      });
  }
  return loading;
}

const analytics = {
  init() {
    load();
  },

  track(event, props) {
    if (!enabled()) return;
    if (posthog) {
      posthog.capture(event, props || {});
      return;
    }
    queue.push([(client, [name, args]) => client.capture(name, args), [event, props || {}]]);
  },

  identify(user) {
    if (!enabled() || !user?.id) return;
    if (posthog) {
      posthog.identify(user.id, { name: user.name, email: user.email });
      return;
    }
    queue.push([
      (client, [id, traits]) => client.identify(id, traits),
      [user.id, { name: user.name, email: user.email }]
    ]);
  },

  page(name) {
    if (!enabled()) return;
    if (posthog) {
      posthog.capture('$pageview', { name });
      return;
    }
    queue.push([(client, [n]) => client.capture('$pageview', { name: n }), [name]]);
  }
};

export default analytics;
