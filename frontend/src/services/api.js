import axios from 'axios';

// Set by AuthProvider. A 401 is ambiguous on its own: for an anonymous visitor
// it is the correct answer and must change nothing, while for someone the app
// believes is signed in it means the session is gone. Only the provider knows
// which of those is true, so it registers the decision.
let onSessionLost = null;

export function setSessionLostHandler(fn) {
  onSessionLost = fn;
}

const api = axios.create({
  baseURL: '/api',
  withCredentials: true
});

let refreshPromise = null;

function getCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// CSRF: attach token from cookie to all state-changing requests
api.interceptors.request.use((config) => {
  if (config.method !== 'get' && config.method !== 'head' && config.method !== 'options') {
    const csrfToken = getCookie('csrf-token');
    if (csrfToken) {
      config.headers['X-CSRF-Token'] = csrfToken;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && error.response?.data?.code === 'TOKEN_EXPIRED' && !originalRequest._retry) {
      originalRequest._retry = true;

      if (!refreshPromise) {
        refreshPromise = api.post('/auth/refresh').finally(() => {
          refreshPromise = null;
        });
      }

      try {
        await refreshPromise;
        return api(originalRequest);
      } catch {
        window.location.href = '/login';
        return Promise.reject(error);
      }
    }

    const sanitized = new Error(error.response?.data?.error || 'Request failed');
    sanitized.status = error.response?.status;
    sanitized.code = error.response?.data?.code;
    sanitized.response = { data: error.response?.data, status: error.response?.status };

    // A hard 401 that is not a refreshable expiry means the session is gone.
    // Left unhandled, the app keeps rendering authenticated chrome — the
    // notification bell alone fires two 401s every 45 seconds forever — while
    // every action behind it fails. The provider ignores this for anonymous
    // visitors, for whom 401 is the expected answer.
    if (sanitized.status === 401 && onSessionLost) onSessionLost();

    // The backend refuses gated routes for unverified accounts. Any component
    // that calls one without sitting behind ProtectedRoute would otherwise show
    // an opaque error, so send the user to the screen that can clear it.
    if (sanitized.code === 'EMAIL_NOT_VERIFIED' && !window.location.pathname.startsWith('/verify-email')) {
      window.location.href = '/verify-email';
    }

    return Promise.reject(sanitized);
  }
);

export default api;
