import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuth } from './useAuth.jsx';
import * as api from '../api/leagues.js';

// Leagues live on the backend (shared, joinable by invite code); only the
// "which league filters my dashboard" preference stays in this browser.
const ACTIVE_ID_KEY = 'dartsActiveLeague';

export const LeagueContext = createContext(null);

export function LeagueProvider({ children }) {
  const auth = useAuth();
  const [leagues, setLeagues] = useState([]);
  const [ready, setReady] = useState(false);
  const [activeId, setActiveId] = useState(() => localStorage.getItem(ACTIVE_ID_KEY));

  const refresh = useCallback(async () => {
    if (!auth.token) { setLeagues([]); setReady(auth.ready); return; }
    try {
      const rows = await api.fetchMyLeagues(auth.token);
      // `players` (names) is what App.jsx/useGames filter on — active members
      // only: ghosts (is_active=false) stay visible in the league card but
      // don't drive the dashboard filter.
      setLeagues(rows.map(l => ({
        ...l,
        players: l.members.filter(m => m.is_active !== false).map(m => m.name),
      })));
    } catch {
      setLeagues([]);
    }
    setReady(true);
  }, [auth.token, auth.ready]);

  useEffect(() => { if (auth.ready) refresh(); }, [auth.ready, refresh]);

  // Logged out ⇒ leagues=[] ⇒ activeLeague=null ⇒ no filter applies.
  const activeLeague = leagues.find(l => l.id === activeId) ?? null;

  const activateLeague = useCallback((id) => {
    setActiveId(prev => {
      const next = prev === id ? null : id;
      if (next) localStorage.setItem(ACTIVE_ID_KEY, next);
      else localStorage.removeItem(ACTIVE_ID_KEY);
      return next;
    });
  }, []);

  const createLeague = useCallback(async (fields) => {
    // fields: { name, motto, icon, privacy_level } (string legacy-compat).
    const payload = typeof fields === 'string' ? { name: fields } : fields;
    const league = await api.createLeague(auth.token, payload);
    await refresh();
    return league;
  }, [auth.token, refresh]);

  const joinDirect = useCallback(async (leagueId) => {
    const res = await api.joinLeagueDirect(auth.token, leagueId);
    await refresh();
    return res;
  }, [auth.token, refresh]);

  const setRole = useCallback(async (leagueId, playerId, role) => {
    await api.setMemberRole(auth.token, leagueId, playerId, role);
    await refresh();
  }, [auth.token, refresh]);

  const joinLeague = useCallback(async (code) => {
    const league = await api.joinLeague(auth.token, code);
    await refresh();
    return league;
  }, [auth.token, refresh]);

  const renameLeague = useCallback(async (id, name) => {
    await api.renameLeague(auth.token, id, name);
    await refresh();
  }, [auth.token, refresh]);

  const deleteLeague = useCallback(async (id) => {
    await api.deleteLeague(auth.token, id);
    setActiveId(a => { if (a === id) localStorage.removeItem(ACTIVE_ID_KEY); return a === id ? null : a; });
    await refresh();
  }, [auth.token, refresh]);

  const addMember = useCallback(async (id, name) => {
    await api.addLeagueMember(auth.token, id, name);
    await refresh();
  }, [auth.token, refresh]);

  const removeMember = useCallback(async (id, playerId) => {
    await api.removeLeagueMember(auth.token, id, playerId);
    await refresh();
  }, [auth.token, refresh]);

  const setWebhook = useCallback(async (id, url) => {
    await api.setLeagueWebhook(auth.token, id, url);
    await refresh();
  }, [auth.token, refresh]);

  return (
    <LeagueContext.Provider
      value={{
        leagues, activeLeague, ready, refresh,
        activateLeague, createLeague, joinLeague, joinDirect, renameLeague, deleteLeague,
        addMember, removeMember, setRole, setWebhook,
      }}
    >
      {children}
    </LeagueContext.Provider>
  );
}

export function useLeague() {
  return useContext(LeagueContext);
}
