import { Routes, Route, Link, NavLink, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useLenis } from './lib/useLenis.js';
import { useGames } from './lib/useGames.js';
import { LeagueProvider, useLeague } from './lib/useLeague.jsx';
import { AuthProvider, useAuth } from './lib/useAuth.jsx';
import { fetchPlayers } from './api/players.js';
import CalloutModal from './components/CalloutModal.jsx';
import Welcome from './routes/Welcome.jsx';
import Hero from './scenes/Hero.jsx';
import Standings from './scenes/Standings.jsx';
import Feed from './scenes/Feed.jsx';
import Trends from './scenes/Trends.jsx';
import Trophies from './scenes/Trophies.jsx';
import PlayerProfile from './routes/PlayerProfile.jsx';
import PlayersIndex from './routes/PlayersIndex.jsx';
import TrophiesPage from './routes/TrophiesPage.jsx';
import XpGuide from './routes/XpGuide.jsx';
import Leagues from './routes/Leagues.jsx';
import Login from './routes/Login.jsx';
import MyProfile from './routes/MyProfile.jsx';
import './App.css';

function Home({ games, stats, ranked, profiles = {} }) {
  return (
    <main>
      <Hero ranked={ranked} games={games} profiles={profiles} />
      <Standings ranked={ranked} profiles={profiles} />
      <Feed games={games} profiles={profiles} />
      <Trends games={games} ranked={ranked} />
      <Trophies stats={stats} profiles={profiles} />
    </main>
  );
}

// Backend player rows (display_name/avatar_url/flight_image_url/accent_color),
// looked up by name to enrich the client-computed stats — fetched once,
// independent of login state since it's plain public GET /players data.
function usePlayerProfiles() {
  const [profiles, setProfiles] = useState({});
  useEffect(() => {
    fetchPlayers()
      .then(rows => setProfiles(Object.fromEntries(rows.map(p => [p.name, p]))))
      .catch(() => {});
  }, []);
  return profiles;
}

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

const COOLDOWN_MS = 15 * 60 * 1000;
const CALLOUT_TS_KEY = 'dartsCalloutLastSent';

function calloutRemainingMs() {
  const last = parseInt(localStorage.getItem(CALLOUT_TS_KEY) || '0', 10);
  return Math.max(0, COOLDOWN_MS - (Date.now() - last));
}

function fmtCountdown(ms) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}m${(s % 60).toString().padStart(2, '0')}s`;
}

function AppInner() {
  useLenis();
  const location = useLocation();
  const auth = useAuth();
  const profiles = usePlayerProfiles();
  const { leagues, activeLeague, activateLeague } = useLeague();
  // Leagues are account-gated: a league filter only applies while signed in.
  // A league activated in a previous session (localStorage) is ignored when
  // logged out, so "no account → no league access" holds across the dashboard.
  const effectiveLeague = auth.player ? activeLeague : null;
  const { games, allGames, stats, ranked, loading, error } = useGames(effectiveLeague?.players ?? null);

  // Onboarding wall: the dashboard (leaderboard, scroll, nav) is reachable only
  // once you're signed in AND a member of a league. Until then we show a single
  // full-screen Welcome with no escape hatch into the dashboard.
  const me = auth.player ? (auth.player.display_name || auth.player.name) : null;
  const hasLeague = !!me && leagues.some(l => l.players.includes(me));
  const onboardingDone = !!(auth.player && hasLeague);
  const [calloutOpen, setCalloutOpen] = useState(false);
  const [calloutRemaining, setCalloutRemaining] = useState(calloutRemainingMs);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [location.pathname]);

  // Local cache of the cooldown countdown — Redis on the backend is the
  // actual source of truth (per-account, not per-browser); this just seeds
  // the UI optimistically and gets corrected by a 429's retry_after_seconds
  // if another device already pinged within the window.
  function markCooldown(remainingMs) {
    localStorage.setItem(CALLOUT_TS_KEY, (Date.now() - (COOLDOWN_MS - remainingMs)).toString());
    setCalloutRemaining(remainingMs);
  }

  // The bell only ever renders while signed in (see nav), so no auth redirect.
  function openCallout() {
    setCalloutOpen(true);
  }

  useEffect(() => {
    if (calloutRemaining <= 0) return;
    const id = setInterval(() => {
      const rem = calloutRemainingMs();
      setCalloutRemaining(rem);
    }, 1000);
    return () => clearInterval(id);
  }, [calloutRemaining > 0]);

  if (loading) {
    return (
      <div className="boot">
        <div className="boot__spinner" />
        <p className="eyebrow">Chargement des parties…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="boot">
        <p className="eyebrow" style={{ color: 'var(--primary)' }}>
          Impossible de charger les parties — {error.message}
        </p>
        <button className="nav__callout" onClick={() => window.location.reload()}>
          Réessayer
        </button>
      </div>
    );
  }

  const knownPlayers = allGames
    ? [...new Set(allGames.flatMap(g => g.players ?? []))].sort((a, b) => a.localeCompare(b, 'fr'))
    : [];

  // Onboarding wall — minimal chrome, no dashboard, no scroll. Only /login,
  // /profile and /ligues are reachable; everything else falls back to Welcome.
  if (!onboardingDone) {
    return (
      <>
        <ScrollTop />
        <nav className="nav nav--bare">
          <Link to="/" className="nav__brand display">DC</Link>
          <div className="nav__right">
            <Link to={auth.player ? '/profile' : '/login'} className="nav__account">
              {auth.player ? (auth.player.display_name || auth.player.name) : 'Connexion'}
            </Link>
          </div>
        </nav>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/profile" element={<MyProfile />} />
          <Route path="/ligues" element={<Leagues knownPlayers={knownPlayers} />} />
          <Route path="*" element={<Welcome hasAccount={!!auth.player} />} />
        </Routes>
      </>
    );
  }

  return (
    <>
      <ScrollTop />
      <nav className="nav">
        <Link to="/" className="nav__brand display">DC</Link>
        <div className="nav__right">
          <Link to={auth.player ? '/profile' : '/login'} className="nav__account">
            {auth.player ? (auth.player.display_name || auth.player.name) : 'Connexion'}
          </Link>
          {auth.player && (
            <button
              className="nav__callout"
              disabled={calloutRemaining > 0}
              onClick={openCallout}
            >
              {calloutRemaining > 0 ? `⏳ ${fmtCountdown(calloutRemaining)}` : '🔔'}
            </button>
          )}
          <button className="nav__burger" onClick={() => setMenuOpen(o => !o)} aria-label="Menu">
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
      </nav>
      {menuOpen && (
        <>
          <div className="nav__backdrop" onClick={() => setMenuOpen(false)} />
          <div className="nav__drawer">
            <NavLink to="/profils" className={({ isActive }) => isActive ? 'is-active' : undefined}>Joueurs</NavLink>
            <NavLink to="/trophees" className={({ isActive }) => isActive ? 'is-active' : undefined}>Trophées</NavLink>
            <NavLink to="/ligues" className={({ isActive }) => isActive ? 'is-active' : undefined}>Ligues</NavLink>
            <NavLink to="/xp" className={({ isActive }) => isActive ? 'is-active' : undefined}>XP</NavLink>
            <span className="nav__count">{(allGames ?? games).length} parties</span>
          </div>
        </>
      )}

      {effectiveLeague && (
        <div className="league-banner">
          <span className="league-banner__label">Ligue active :</span>
          <span className="league-banner__name">{effectiveLeague.name}</span>
          <span className="league-banner__players">{effectiveLeague.players.join(' · ')}</span>
          <button
            className="league-banner__clear"
            onClick={() => activateLeague(effectiveLeague.id)}
            title="Désactiver le filtre ligue"
          >
            × Tout voir
          </button>
        </div>
      )}

      <CalloutModal
        open={calloutOpen}
        onClose={() => setCalloutOpen(false)}
        onSent={() => markCooldown(COOLDOWN_MS)}
        onCooldown={(retryAfterSeconds) => markCooldown(retryAfterSeconds * 1000)}
        token={auth.token}
        name={auth.player?.display_name || auth.player?.name}
      />

      <Routes>
        <Route path="/" element={<Home games={games} stats={stats} ranked={ranked} profiles={profiles} />} />
        <Route path="/joueur/:name" element={<PlayerProfile games={games} stats={stats} profiles={profiles} />} />
        <Route path="/profils" element={<PlayersIndex ranked={ranked} profiles={profiles} />} />
        <Route path="/trophees" element={<TrophiesPage stats={stats} profiles={profiles} />} />
        <Route path="/xp" element={<XpGuide />} />
        <Route path="/ligues" element={<Leagues knownPlayers={knownPlayers} />} />
        <Route path="/login" element={<Login />} />
        <Route path="/profile" element={<MyProfile />} />
        <Route path="*" element={<Home games={games} stats={stats} ranked={ranked} profiles={profiles} />} />
      </Routes>

      <footer className="footer shell">
        <span>DartsCounter — La Ligue</span>
        <a href="https://github.com/mokakejr/DartsCounter-" target="_blank" rel="noreferrer">
          GitHub ↗
        </a>
      </footer>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <LeagueProvider>
        <AppInner />
      </LeagueProvider>
    </AuthProvider>
  );
}
