import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { loadLeagues } from './data.js';
import { postLeague } from './postLeague.js';

const ACTIVE_ID_KEY = 'dartsActiveLeague';
const IDENTITY_KEY   = 'dartsIdentity';   // { [leagueId]: playerName } — who "you" are
const SEEN_KEY       = 'dartsSeenWelcome'; // '1' once the user has picked/skipped a league

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function loadIdentity() {
  try { return JSON.parse(localStorage.getItem(IDENTITY_KEY) || '{}'); }
  catch { return {}; }
}

export const LeagueContext = createContext(null);

export function LeagueProvider({ children }) {
  const [leagues, setLeagues] = useState(null);   // null = loading
  const [error, setError] = useState(null);
  const [activeId, setActiveId] = useState(() => localStorage.getItem(ACTIVE_ID_KEY));
  const [identity, setIdentityState] = useState(loadIdentity);
  // Has the visitor already chosen a league (or explicitly skipped)? Drives the
  // first-visit Welcome gate. Treat an already-active league as "seen".
  const [seenWelcome, setSeenWelcome] = useState(
    () => localStorage.getItem(SEEN_KEY) === '1' || !!localStorage.getItem(ACTIVE_ID_KEY)
  );

  useEffect(() => {
    let alive = true;
    loadLeagues()
      .then(ls => { if (alive) setLeagues(ls); })
      .catch(e => { if (alive) { console.error('loadLeagues failed:', e); setError(e); setLeagues([]); } });
    return () => { alive = false; };
  }, []);

  const activeLeague = (leagues ?? []).find(l => l.id === activeId) ?? null;

  const persistActive = useCallback((id) => {
    if (id) localStorage.setItem(ACTIVE_ID_KEY, id);
    else localStorage.removeItem(ACTIVE_ID_KEY);
    setActiveId(id);
  }, []);

  const markSeen = useCallback(() => {
    localStorage.setItem(SEEN_KEY, '1');
    setSeenWelcome(true);
  }, []);

  // Toggle the active-league filter. Passing the active id again clears it.
  const activateLeague = useCallback((id) => {
    setActiveId(prev => {
      const next = prev === id ? null : id;
      if (next) localStorage.setItem(ACTIVE_ID_KEY, next);
      else localStorage.removeItem(ACTIVE_ID_KEY);
      return next;
    });
  }, []);

  const upsertLocal = useCallback((league) => {
    setLeagues(prev => {
      const rest = (prev ?? []).filter(l => l.id !== league.id);
      return [league, ...rest];
    });
  }, []);

  const createLeague = useCallback((name, players, color) => {
    const league = { id: uid(), name: name.trim(), players, createdAt: new Date().toISOString() };
    if (color) league.color = color;
    upsertLocal(league);          // optimistic
    postLeague(league);           // fire-and-forget shared write
    return league;
  }, [upsertLocal]);

  const updateLeague = useCallback((id, name, players, color) => {
    setLeagues(prev => {
      const next = (prev ?? []).map(l => {
        if (l.id !== id) return l;
        const updated = { ...l, name: name.trim(), players };
        if (color) updated.color = color; else delete updated.color;
        return updated;
      });
      const target = next.find(l => l.id === id);
      if (target) postLeague(target);
      return next;
    });
  }, []);

  const deleteLeague = useCallback((id) => {
    setLeagues(prev => (prev ?? []).filter(l => l.id !== id));
    postLeague({ id, _delete: true });
    setActiveId(a => {
      if (a === id) localStorage.removeItem(ACTIVE_ID_KEY);
      return a === id ? null : a;
    });
  }, []);

  const setIdentity = useCallback((leagueId, playerName) => {
    setIdentityState(prev => {
      const next = { ...prev, [leagueId]: playerName };
      localStorage.setItem(IDENTITY_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Join = pick your identity, ensure you're on the roster, activate the league.
  const joinLeague = useCallback((leagueId, playerName) => {
    setLeagues(prev => {
      const next = (prev ?? []).map(l => {
        if (l.id !== leagueId) return l;
        const players = l.players.includes(playerName) ? l.players : [...l.players, playerName];
        return { ...l, players };
      });
      const target = next.find(l => l.id === leagueId);
      if (target) postLeague(target);
      return next;
    });
    setIdentity(leagueId, playerName);
    persistActive(leagueId);
    markSeen();
  }, [setIdentity, persistActive, markSeen]);

  const myPlayer = useCallback((leagueId) => identity[leagueId] ?? null, [identity]);

  return (
    <LeagueContext.Provider value={{
      leagues: leagues ?? [],
      loading: leagues === null,
      error,
      activeLeague,
      activeId,
      seenWelcome,
      markSeen,
      activateLeague,
      persistActive,
      createLeague,
      updateLeague,
      deleteLeague,
      joinLeague,
      myPlayer,
      identity,
    }}>
      {children}
    </LeagueContext.Provider>
  );
}

export function useLeague() {
  return useContext(LeagueContext);
}
