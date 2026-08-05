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

    // A revoked session (logout elsewhere, password change/reset) can't be
    // refreshed — go to the login page directly.
    if (error.response?.status === 401 && error.response?.data?.code === 'SESSION_REVOKED') {
      if (window.location.pathname !== '/login') window.location.href = '/login';
      return Promise.reject(error);
    }

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
      } catch (refreshError) {
        // Only treat definitive auth rejections as "log in again". Transient
        // errors (5xx, rate-limit 429, network) must NOT kick the user out —
        // the next request can simply try refreshing again.
        const status = refreshError.response?.status;
        if ((status === 401 || status === 403) && window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    }

    const sanitized = new Error(error.response?.data?.error || 'Request failed');
    sanitized.status = error.response?.status;
    sanitized.code = error.response?.data?.code;
    sanitized.response = { data: error.response?.data, status: error.response?.status };
    return Promise.reject(sanitized);
  }
);

export default api;
