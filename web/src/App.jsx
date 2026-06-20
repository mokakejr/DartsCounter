import { Routes, Route, Link, NavLink, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useLenis } from './lib/useLenis.js';
import { useGames } from './lib/useGames.js';
import { LeagueProvider, useLeague } from './lib/useLeague.jsx';
import CalloutModal from './components/CalloutModal.jsx';
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
import PlayHome from './routes/play/PlayHome.jsx';
import PlaySetup from './routes/play/PlaySetup.jsx';
import ShanghaiGame from './routes/play/ShanghaiGame.jsx';
import CricketGame from './routes/play/CricketGame.jsx';
import FiftyOneGame from './routes/play/FiftyOneGame.jsx';
import './App.css';

function Home({ games, stats, ranked }) {
  return (
    <main>
      <Hero ranked={ranked} games={games} />
      <Standings ranked={ranked} />
      <Feed games={games} />
      <Trends games={games} ranked={ranked} />
      <Trophies stats={stats} />
    </main>
  );
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
  const isPlaying = location.pathname.startsWith('/play');
  const { activeLeague, activateLeague } = useLeague();
  const { games, allGames, stats, ranked, loading, error } = useGames(activeLeague?.players ?? null);
  const [calloutOpen, setCalloutOpen] = useState(false);
  const [calloutRemaining, setCalloutRemaining] = useState(calloutRemainingMs);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [location.pathname]);

  useEffect(() => {
    if (calloutRemaining <= 0) return;
    const id = setInterval(() => {
      const rem = calloutRemainingMs();
      setCalloutRemaining(rem);
    }, 1000);
    return () => clearInterval(id);
  }, [calloutRemaining > 0]);

  if (loading && !isPlaying) {
    return (
      <div className="boot">
        <div className="boot__spinner" />
        <p className="eyebrow">Chargement des parties…</p>
      </div>
    );
  }

  if (error && !isPlaying) {
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

  if (isPlaying) {
    return (
      <>
        <ScrollTop />
        <Routes>
          <Route path="/play" element={<PlayHome />} />
          <Route path="/play/setup" element={<PlaySetup />} />
          <Route path="/play/shanghai" element={<ShanghaiGame />} />
          <Route path="/play/cricket" element={<CricketGame />} />
          <Route path="/play/super-cricket" element={<CricketGame />} />
          <Route path="/play/51" element={<FiftyOneGame />} />
        </Routes>
      </>
    );
  }

  const knownPlayers = allGames
    ? [...new Set(allGames.flatMap(g => g.players ?? []))].sort((a, b) => a.localeCompare(b, 'fr'))
    : [];

  return (
    <>
      <ScrollTop />
      <nav className="nav">
        <Link to="/" className="nav__brand display">DC</Link>
        <div className="nav__right">
          <button
            className="nav__callout"
            disabled={calloutRemaining > 0}
            onClick={() => setCalloutOpen(true)}
          >
            {calloutRemaining > 0 ? `⏳ ${fmtCountdown(calloutRemaining)}` : '🔔'}
          </button>
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

      {activeLeague && (
        <div className="league-banner">
          <span className="league-banner__label">Ligue active :</span>
          <span className="league-banner__name">{activeLeague.name}</span>
          <span className="league-banner__players">{activeLeague.players.join(' · ')}</span>
          <button
            className="league-banner__clear"
            onClick={() => activateLeague(activeLeague.id)}
            title="Désactiver le filtre ligue"
          >
            × Tout voir
          </button>
        </div>
      )}

      <CalloutModal
        open={calloutOpen}
        onClose={() => setCalloutOpen(false)}
        onSent={() => setCalloutRemaining(COOLDOWN_MS)}
        players={ranked.map(s => s.name)}
        leagueName={activeLeague?.name ?? null}
      />

      <Routes>
        <Route path="/" element={<Home games={games} stats={stats} ranked={ranked} />} />
        <Route path="/joueur/:name" element={<PlayerProfile games={games} stats={stats} />} />
        <Route path="/profils" element={<PlayersIndex ranked={ranked} />} />
        <Route path="/trophees" element={<TrophiesPage stats={stats} />} />
        <Route path="/xp" element={<XpGuide />} />
        <Route path="/ligues" element={<Leagues knownPlayers={knownPlayers} />} />
        <Route path="*" element={<Home games={games} stats={stats} ranked={ranked} />} />
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
    <LeagueProvider>
      <AppInner />
    </LeagueProvider>
  );
}
