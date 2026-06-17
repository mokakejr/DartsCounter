import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useLenis } from './lib/useLenis.js';
import { useGames } from './lib/useGames.js';
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

export default function App() {
  useLenis();
  const { games, stats, ranked, loading } = useGames();
  const [calloutOpen, setCalloutOpen] = useState(false);
  const [calloutRemaining, setCalloutRemaining] = useState(calloutRemainingMs);

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

  return (
    <>
      <ScrollTop />
      <nav className="nav">
        <Link to="/" className="nav__brand display">DC</Link>
        <div className="nav__links">
          <Link to="/profils">Joueurs</Link>
          <Link to="/trophees">Trophées</Link>
          <Link to="/xp">XP</Link>
          <span className="nav__count">{games.length} parties</span>
          <button
            className="nav__callout"
            disabled={calloutRemaining > 0}
            onClick={() => setCalloutOpen(true)}
          >
            {calloutRemaining > 0 ? `⏳ ${fmtCountdown(calloutRemaining)}` : '🎯 Qui joue ?'}
          </button>
        </div>
      </nav>

      <CalloutModal
        open={calloutOpen}
        onClose={() => setCalloutOpen(false)}
        onSent={() => setCalloutRemaining(COOLDOWN_MS)}
        players={ranked.map(s => s.name)}
      />

      <Routes>
        <Route path="/" element={<Home games={games} stats={stats} ranked={ranked} />} />
        <Route path="/joueur/:name" element={<PlayerProfile games={games} stats={stats} />} />
        <Route path="/profils" element={<PlayersIndex ranked={ranked} />} />
        <Route path="/trophees" element={<TrophiesPage stats={stats} />} />
        <Route path="/xp" element={<XpGuide />} />
        <Route path="*" element={<Home games={games} stats={stats} ranked={ranked} />} />
      </Routes>

      <footer className="footer shell">
        <span>DartsCounter — La Ligue</span>
        <a href="https://github.com/mokakejr/DartsCounter" target="_blank" rel="noreferrer">
          GitHub ↗
        </a>
      </footer>
    </>
  );
}
