import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api, { setSessionLostHandler } from '../services/api';
import analytics from '../utils/analytics';

const AuthContext = createContext(null);

const trackUser = (user, event) => {
  if (user?._id) analytics.identify(user);
  analytics.track(event);
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const res = await api.get('/auth/me');
      setUser(res.data.user);
      if (res.data.user?._id) analytics.identify(res.data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  // Clear the session on any unrecoverable 401 so the UI stops claiming to be
  // signed in. The functional update reads current state instead of closing
  // over `user`, which would need this effect to re-register on every change.
  useEffect(() => {
    setSessionLostHandler(() => {
      setUser((current) => (current ? null : current));
    });
    return () => setSessionLostHandler(null);
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    setUser(res.data.user);
    trackUser(res.data.user, 'login');
    return res.data;
  };

  const register = async (email, password, name, preferredLanguage, referralCode) => {
    const res = await api.post('/auth/register', { email, password, name, preferredLanguage, referralCode });
    if (res.data.user) {
      setUser(res.data.user);
    }
    trackUser(res.data.user, 'signup');
    return res.data;
  };

  const googleLogin = async (credential) => {
    const res = await api.post('/auth/google-login', { credential });
    setUser(res.data.user);
    trackUser(res.data.user, 'login');
    return res.data;
  };

  const resendVerification = async () => {
    const res = await api.post('/auth/resend-verification');
    if (res.data.user) setUser(res.data.user);
    return res.data;
  };

  // Clearing local state is unconditional. The session lives in an httpOnly
  // cookie, so a failed request means that cookie survives and a later reload
  // would restore the session. That is still better than the alternative this
  // used to produce: the rejection escaped, the caller never ran its next
  // line, and the user was left staring at an authenticated page whose Log out
  // button did nothing. The error is still rethrown so the caller can say so.
  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, googleLogin, resendVerification, logout, fetchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
