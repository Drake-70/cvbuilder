import axios from 'axios';

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
