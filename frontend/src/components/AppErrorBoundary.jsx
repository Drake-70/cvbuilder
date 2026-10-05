import { Component } from 'react';
import { captureException } from '../utils/sentry';

function CrashFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="text-center max-w-md">
        <h1 className="text-xl font-bold text-slate-900 mb-2">Something went wrong</h1>
        <p className="text-slate-600 mb-4">An unexpected error occurred. Please refresh the page to continue.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700"
        >
          Reload
        </button>
      </div>
    </div>
  );
}

// A local boundary rather than Sentry's own. Sentry.ErrorBoundary is a static
// import, and using it meant the SDK had to be in the entry chunk before any
// render could happen. This boundary renders immediately and reports through
// Sentry once it loads — or never, if it is disabled, which is the same
// outcome the old code had when no DSN was configured.
export default class AppErrorBoundary extends Component {
  state = { error: null };

  componentDidCatch(error, info) {
    captureException(error, { componentStack: info?.componentStack });
  }

  render() {
    if (this.state.error) return <CrashFallback />;
    return this.props.children;
  }
}
