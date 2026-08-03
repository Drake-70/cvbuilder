import posthog from 'posthog-js'

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com'

const enabled = () => Boolean(POSTHOG_KEY && typeof window !== 'undefined')

const analytics = {
  init() {
    if (!enabled()) return
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      autocapture: false,
      capture_pageview: false,
      persistence: 'localStorage'
    })
  },

  track(event, props) {
    if (!enabled()) return
    posthog.capture(event, props || {})
  },

  identify(user) {
    if (!enabled() || !user?.id) return
    posthog.identify(user.id, {
      name: user.name,
      email: user.email
    })
  },

  page(name) {
    if (!enabled()) return
    posthog.capture('$pageview', { name })
  }
}

export default analytics
