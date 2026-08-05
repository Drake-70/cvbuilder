import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
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

  const logout = async () => {
    await api.post('/auth/logout');
    setUser(null);
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
