import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { fetchMe, login as apiLogin, signup as apiSignup } from '../api/players.js';

const TOKEN_KEY = 'dartsAuthToken';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [player, setPlayer] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!token) { setReady(true); return; }
    fetchMe(token)
      .then(setPlayer)
      .catch(() => { localStorage.removeItem(TOKEN_KEY); setToken(null); })
      .finally(() => setReady(true));
  }, [token]);

  const applySession = useCallback(({ access_token, player }) => {
    localStorage.setItem(TOKEN_KEY, access_token);
    setToken(access_token);
    setPlayer(player);
  }, []);

  const login = useCallback(async (name, password) => {
    applySession(await apiLogin(name, password));
  }, [applySession]);

  const signup = useCallback(async (name, password) => {
    applySession(await apiSignup(name, password));
  }, [applySession]);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setPlayer(null);
  }, []);

  const updatePlayer = useCallback((next) => setPlayer(next), []);

  return (
    <AuthContext.Provider value={{ token, player, ready, login, signup, logout, updatePlayer }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
