import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api.get('/auth/me');
      setUser(me.user); setOrg(me.org);
    } catch { setUser(null); setOrg(null); }
    finally { setLoading(false); }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { refresh(); }, []);

  const login = useCallback(async (email, password) => {
    const out = await api.post('/auth/login', { email, password });
    setUser(out.user); setOrg(out.org);
    return out;
  }, []);

  const register = useCallback(async (payload) => {
    const out = await api.post('/auth/register', payload);
    setUser(out.user); setOrg(out.org);
    return out;
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout', {}); } catch { /* ignore */ }
    setUser(null); setOrg(null);
  }, []);

  const value = useMemo(() => ({ user, org, loading, login, register, logout, refresh, setUser, setOrg }), [user, org, loading, login, register, logout, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
