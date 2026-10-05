const DSN = import.meta.env.VITE_SENTRY_DSN

let sentry = null
let loading = null
const pending = []

// Sentry is loaded on demand rather than imported. It used to be a static
// import of the entry chunk, which made the browser download and parse the
// whole SDK before the app could paint anything — around 240 KB of error
// monitoring sitting on the critical path of every page load.
export function initSentry() {
  if (!DSN) return Promise.resolve(null)
  if (sentry) return Promise.resolve(sentry)
  if (!loading) {
    loading = import('@sentry/react')
      .then((mod) => {
        mod.init({
          dsn: DSN,
          environment: import.meta.env.VITE_APP_ENV || import.meta.env.MODE,
          tracesSampleRate: 0.1
        })
        sentry = mod
        return mod
      })
      .catch(() => {
        loading = null
        return null
      })
  }
  return loading
}

// A crash can happen before the SDK finishes loading, and a crash boundary
// that silently drops the first error is worse than useless. Buffer instead,
// then flush once the SDK is available.
export function captureException(error, context) {
  if (sentry) {
    sentry.captureException(error, context)
    return
  }
  if (!DSN) return

  pending.push([error, context])
  initSentry().then(() => {
    while (pending.length) {
      const [err, ctx] = pending.shift()
      sentry?.captureException(err, ctx)
    }
  })
}
