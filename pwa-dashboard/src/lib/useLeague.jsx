import { createContext, useContext, useState, useCallback } from 'react';

const LEAGUES_KEY    = 'dartsLeagues';
const ACTIVE_ID_KEY  = 'dartsActiveLeague';

function load() {
  try { return JSON.parse(localStorage.getItem(LEAGUES_KEY) || '[]'); }
  catch { return []; }
}

function save(leagues) {
  localStorage.setItem(LEAGUES_KEY, JSON.stringify(leagues));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export const LeagueContext = createContext(null);

export function LeagueProvider({ children }) {
  const [leagues, setLeagues] = useState(load);
  const [activeId, setActiveId] = useState(() => localStorage.getItem(ACTIVE_ID_KEY));

  const activeLeague = leagues.find(l => l.id === activeId) ?? null;

  const createLeague = useCallback((name, players) => {
    const league = { id: uid(), name: name.trim(), players };
    setLeagues(prev => {
      const next = [...prev, league];
      save(next);
      return next;
    });
    return league;
  }, []);

  const updateLeague = useCallback((id, name, players) => {
    setLeagues(prev => {
      const next = prev.map(l => l.id === id ? { ...l, name: name.trim(), players } : l);
      save(next);
      return next;
    });
  }, []);

  const deleteLeague = useCallback((id) => {
    setLeagues(prev => {
      const next = prev.filter(l => l.id !== id);
      save(next);
      return next;
    });
    setActiveId(a => { if (a === id) localStorage.removeItem(ACTIVE_ID_KEY); return a === id ? null : a; });
  }, []);

  const activateLeague = useCallback((id) => {
    setActiveId(prev => {
      const next = prev === id ? null : id;
      if (next) localStorage.setItem(ACTIVE_ID_KEY, next);
      else localStorage.removeItem(ACTIVE_ID_KEY);
      return next;
    });
  }, []);

  return (
    <LeagueContext.Provider value={{ leagues, activeLeague, activateLeague, createLeague, updateLeague, deleteLeague }}>
      {children}
    </LeagueContext.Provider>
  );
}

export function useLeague() {
  return useContext(LeagueContext);
}
