import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from './contexts/ThemeContext'
import { ToastProvider } from './contexts/ToastContext'
import AppErrorBoundary from './components/AppErrorBoundary'
import analytics from './utils/analytics'
import { initSentry } from './utils/sentry'
import { loadTelemetry } from './utils/telemetry'
import './i18n'
import './index.css'
import App from './App.jsx'

// Both of these are deferred to the load event. Neither is needed to render
// the app, and eagerly importing or fetching them cost real load time: the
// Sentry and PostHog SDKs together were the largest chunk in the entry graph,
// and the telemetry script was parser-blocking. See the utils for detail.
window.addEventListener('load', () => {
  initSentry();
  loadTelemetry();

  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => console.warn('SW registration failed:', err.message));
  } else if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister())).catch(() => {});
  }
}, { once: true });

analytics.init();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <AppErrorBoundary>
            <App />
          </AppErrorBoundary>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)
